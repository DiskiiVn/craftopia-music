const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const axios = require('axios');
const config = require('../../config');
const musicManager = require('../player/MusicManager');
const lyricsService = require('../player/LyricsService');
const bot = require('../bot/bot');

class WebServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        
        // Trust reverse proxy (Cloudflare, Vercel, Render, Nginx)
        this.app.set('trust proxy', 1);

        this.io = new Server(this.server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });

        musicManager.setSocketIO(this.io);
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSockets();
        this.startTicker();
    }

    setupMiddleware() {
        this.app.set('trust proxy', 1);
        this.app.use(cors({
            origin: true,
            credentials: true
        }));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(session({
            secret: config.sessionSecret,
            resave: false,
            saveUninitialized: false,
            cookie: {
                maxAge: 7 * 24 * 60 * 60 * 1000,
                secure: false,
                sameSite: 'lax'
            }
        }));

        this.app.use(express.static(path.join(__dirname, '../../public')));
    }

    setupRoutes() {
        // Health Check for Keep-Alive & Cloud Monitors
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                domain: config.domain,
                botReady: bot.client.isReady(),
                uptime: process.uptime(),
                guilds: bot.client.isReady() ? bot.client.guilds.cache.size : 0
            });
        });

        // Config endpoint for Frontend
        this.app.get('/api/config', (req, res) => {
            res.json({
                domain: config.domain,
                clientId: config.clientId,
                botReady: bot.client.isReady(),
                totalBots: bot.clients.length
            });
        });

        // --- Multi-Bot Pool Status & Invite Endpoints ---
        this.app.get('/api/bots', (req, res) => {
            const botsList = (bot.clients || []).map((client, idx) => {
                const isOnline = Boolean(client && client.isReady && client.isReady());
                const user = client?.user;
                const clientId = user?.id || (idx === 0 ? config.clientId : '');
                
                // Discord Bot Invite URLs
                const permissions = '36700160'; // Standard Voice + Text permissions
                const inviteUrl = clientId
                    ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`
                    : '';
                const inviteAdminUrl = clientId
                    ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`
                    : '';

                // Active playing info
                let activePlayingGuilds = 0;
                let activeChannels = [];
                if (musicManager && musicManager.players) {
                    for (const player of musicManager.players.values()) {
                        if (player.botUser && player.botUser.id === user?.id && player.currentTrack && !player.isPaused) {
                            activePlayingGuilds++;
                            activeChannels.push({
                                guildId: player.guildId,
                                channelName: player.voiceChannelName,
                                trackTitle: player.currentTrack.title
                            });
                        }
                    }
                }

                return {
                    index: client.botIndex || (idx + 1),
                    id: clientId,
                    username: user ? user.username : `Craftopia Music #${idx + 1}`,
                    tag: user ? user.tag : `Craftopia Music #${idx + 1}`,
                    avatar: user ? (user.displayAvatarURL ? user.displayAvatarURL() : `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`) : 'https://cdn.discordapp.com/embed/avatars/0.png',
                    status: isOnline ? 'online' : 'offline',
                    isOnline,
                    isBusy: activePlayingGuilds > 0,
                    ping: (isOnline && client.ws) ? client.ws.ping : null,
                    guildCount: (isOnline && client.guilds) ? client.guilds.cache.size : 0,
                    activePlayingGuilds,
                    activeChannels,
                    inviteUrl,
                    inviteAdminUrl
                };
            });

            const onlineCount = botsList.filter(b => b.isOnline).length;
            res.json({
                totalBots: bot.clients ? bot.clients.length : 1,
                onlineBots: onlineCount,
                bots: botsList
            });
        });

        // Direct Redirect to Bot Invite
        this.app.get('/invite', (req, res) => {
            const primaryId = bot.client?.user?.id || config.clientId;
            if (primaryId) {
                return res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${primaryId}&permissions=36700160&scope=bot%20applications.commands`);
            }
            res.redirect('/');
        });

        this.app.get('/invite/:index', (req, res) => {
            const idx = parseInt(req.params.index, 10) - 1;
            const targetClient = (bot.clients && bot.clients[idx]) ? bot.clients[idx] : bot.client;
            const targetId = targetClient?.user?.id || config.clientId;
            if (targetId) {
                return res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${targetId}&permissions=36700160&scope=bot%20applications.commands`);
            }
            res.redirect('/');
        });

        // --- Discord OAuth2 Endpoints ---
        this.app.get('/api/auth/login', (req, res) => {
            if (!config.clientId || !config.clientSecret) {
                return res.redirect('/?guest=true');
            }
            const scopes = encodeURIComponent('identify guilds');
            const redirect = encodeURIComponent(config.redirectUri);
            const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&redirect_uri=${redirect}&response_type=code&scope=${scopes}`;
            res.redirect(authUrl);
        });

        this.app.get('/api/auth/callback', async (req, res) => {
            const { code } = req.query;
            if (!code) return res.redirect('/?error=no_code');

            try {
                const params = new URLSearchParams({
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                    grant_type: 'authorization_code',
                    code: code.toString(),
                    redirect_uri: config.redirectUri
                });

                const tokenRes = await axios.post('https://discord.com/api/oauth2/token', params.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });

                const accessToken = tokenRes.data.access_token;
                const userRes = await axios.get('https://discord.com/api/users/@me', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });

                let userGuildIds = [];
                try {
                    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    userGuildIds = guildsRes.data.map(g => g.id);
                } catch (gErr) {
                    console.warn('[OAuth2 Guilds fetch notice]:', gErr.message);
                }

                req.session.user = {
                    id: userRes.data.id,
                    username: userRes.data.global_name || userRes.data.username,
                    avatar: userRes.data.avatar 
                        ? `https://cdn.discordapp.com/avatars/${userRes.data.id}/${userRes.data.avatar}.png` 
                        : 'https://cdn.discordapp.com/embed/avatars/0.png'
                };
                req.session.userGuildIds = userGuildIds;

                res.redirect('/');
            } catch (err) {
                console.error('[OAuth2 Error]:', err.response?.data || err.message);
                res.redirect('/?error=auth_failed');
            }
        });

        this.app.get('/api/auth/me', (req, res) => {
            if (req.session.user && req.session.user.id && req.session.user.id !== 'dashboard') {
                return res.json({ loggedIn: true, user: req.session.user });
            }
            res.json({
                loggedIn: false,
                user: null
            });
        });

        this.app.get('/api/auth/logout', (req, res) => {
            req.session.destroy(() => {
                res.json({ success: true });
            });
        });

        // --- Guilds API ---
        this.app.get('/api/guilds', (req, res) => {
            if (!req.session.user || !req.session.user.id || req.session.user.id === 'dashboard') {
                return res.status(401).json({ error: 'Vui lòng đăng nhập Discord để sử dụng!', loggedIn: false });
            }

            if (!bot.client || !bot.client.isReady()) {
                return res.json({ guilds: [] });
            }

            const userGuildIds = req.session.userGuildIds || [];
            let matchingGuilds = bot.client.guilds.cache;
            if (userGuildIds.length > 0) {
                matchingGuilds = matchingGuilds.filter(g => userGuildIds.includes(g.id));
            }

            const guilds = matchingGuilds.map(g => ({
                id: g.id,
                name: g.name,
                icon: g.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png',
                memberCount: g.memberCount,
                hasActivePlayer: musicManager.getPlayersForGuild(g.id).length > 0,
                activePlayerCount: musicManager.getPlayersForGuild(g.id).length
            }));

            res.json({ guilds, botPoolCount: bot.clients.length });
        });

        this.app.get('/api/guilds/:id', (req, res) => {
            const guildId = req.params.id;
            const guild = bot.client ? bot.client.guilds.cache.get(guildId) : null;
            if (!guild) {
                return res.status(404).json({ error: 'Bot không tham gia Server này!' });
            }

            const voiceChannels = guild.channels.cache
                .filter(c => c.isVoiceBased())
                .map(c => {
                    const chPlayer = musicManager.getPlayerByVoice(guildId, c.id);
                    return {
                        id: c.id,
                        name: c.name,
                        membersCount: c.members.size,
                        members: c.members.map(m => ({
                            id: m.id,
                            username: m.user.username,
                            avatar: m.user.avatarURL() || 'https://cdn.discordapp.com/embed/avatars/0.png'
                        })),
                        activePlayer: chPlayer ? {
                            bot: chPlayer.toJSON().bot,
                            currentTrack: chPlayer.currentTrack,
                            isPaused: chPlayer.isPaused
                        } : null
                    };
                });

            // Find player based on user's current voice channel if present
            const userId = req.session.user?.id;
            let userVoiceId = null;
            if (userId && userId !== 'dashboard') {
                const vs = guild.voiceStates.cache.get(userId);
                if (vs && vs.channelId) userVoiceId = vs.channelId;
            }

            const player = musicManager.getPlayer(guildId, userVoiceId);
            const activePlayers = musicManager.getPlayersForGuild(guildId).map(p => p.toJSON());

            res.json({
                guild: {
                    id: guild.id,
                    name: guild.name,
                    icon: guild.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png'
                },
                voiceChannels,
                player: player ? player.toJSON() : { guildId, currentTrack: null, queue: [] },
                activePlayers,
                botCount: bot.clients.length
            });
        });

        // --- Search API ---
        this.app.get('/api/search', async (req, res) => {
            const query = req.query.q;
            if (!query) return res.json({ results: [] });
            try {
                const results = await musicManager.search(query, 12);
                res.json({ results });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // --- Real Synchronized Lyrics API ---
        this.app.get('/api/lyrics', async (req, res) => {
            const { title, artist, duration } = req.query;
            if (!title) return res.status(400).json({ error: 'Thiếu tên bài hát' });

            try {
                const lyrics = await lyricsService.getLyrics(title, artist, parseFloat(duration) || 0);
                res.json(lyrics);
            } catch (err) {
                console.error('[Lyrics API Error]:', err.message);
                res.status(500).json({ error: 'Không thể tải lời bài hát' });
            }
        });

        // --- Player Controls API ---
        this.app.post('/api/guilds/:id/join', async (req, res) => {
            const guildId = req.params.id;
            const { voiceChannelId } = req.body;
            const guild = bot.client ? bot.client.guilds.cache.get(guildId) : null;
            if (!guild) return res.status(404).json({ error: 'Server không tìm thấy!' });

            const channel = guild.channels.cache.get(voiceChannelId);
            if (!channel || !channel.isVoiceBased()) {
                return res.status(400).json({ error: 'Kênh voice không hợp lệ!' });
            }

            const botResult = bot.getAvailableBotForVoice(guildId, channel.id);
            if (!botResult.bot) {
                if (botResult.missingFromGuild && botResult.missingFromGuild.length > 0) {
                    const missing = botResult.missingFromGuild[0];
                    return res.status(400).json({
                        error: `Cụm có Bot #${missing.botIndex} (${missing.user?.username || 'Bot'}) đang sẵn sàng nhưng chưa được mời vào Server này! Hãy mời bot vào server trước nhé.`,
                        inviteUrl: `/invite/${missing.botIndex || 1}`
                    });
                }
                return res.status(400).json({ error: 'Tất cả các Bot đều đang bận phục vụ người nghe ở phòng khác!' });
            }

            const player = musicManager.getOrCreatePlayer(guildId, botResult.bot, channel.id);
            await player.join(channel, null, botResult.bot);
            musicManager.emitUpdate(guildId, player);
            res.json({ success: true, message: `Bot #${botResult.bot.botIndex} (${botResult.bot.user.username}) đã kết nối vào ${channel.name}` });
        });

        this.app.post('/api/guilds/:id/leave', (req, res) => {
            const guildId = req.params.id;
            const { voiceChannelId } = req.body;
            const player = musicManager.getPlayer(guildId, voiceChannelId);
            if (player) {
                player.destroy();
            }
            res.json({ success: true, message: 'Bot đã rời kênh voice' });
        });

        this.app.post('/api/guilds/:id/play', async (req, res) => {
            if (!req.session.user || !req.session.user.id || req.session.user.id === 'dashboard') {
                return res.status(401).json({ error: 'Vui lòng đăng nhập Discord để sử dụng!', loggedIn: false });
            }

            const guildId = req.params.id;
            const userId = req.session.user.id;
            const { query, trackData, playNow } = req.body;

            const guild = bot.client ? bot.client.guilds.cache.get(guildId) : null;
            if (!guild) return res.status(404).json({ error: 'Server không tìm thấy trên bot!' });

            // 1. Tự động quét kênh thoại người dùng đang tham gia
            let targetVoice = null;

            // Kiểm tra trong voiceStates cache trước
            const voiceState = guild.voiceStates.cache.get(userId);
            if (voiceState && voiceState.channel) {
                targetVoice = voiceState.channel;
            }

            // Nếu chưa có trong cache, fetch member từ Discord API để có voice state tức thời
            if (!targetVoice) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member && member.voice && member.voice.channel) {
                    targetVoice = member.voice.channel;
                }
            }

            // 2. Nếu người dùng chưa vào bất kỳ phòng voice nào trong Server này:
            if (!targetVoice) {
                return res.status(400).json({
                    error: `Bạn chưa vào phòng voice nào trong Server "${guild.name}"! Vui lòng vào 1 phòng voice trên Discord rồi nhấn phát lại nhé.`
                });
            }

            // 3. Multi-Bot: Điều phối bot khả dụng vào phòng voice
            const botResult = bot.getAvailableBotForVoice(guildId, targetVoice.id);
            if (!botResult.bot) {
                if (botResult.missingFromGuild && botResult.missingFromGuild.length > 0) {
                    const missing = botResult.missingFromGuild[0];
                    const inviteUrl = `/invite/${missing.botIndex || 1}`;
                    return res.status(400).json({
                        error: `Phòng khác hiện đang có người nghe nhạc. Cụm Multi-Bot có Bot #${missing.botIndex} (${missing.user?.username || 'Bot'}) đang rảnh nhưng CHƯA ĐƯỢC MỜI vào Server "${guild.name}"! Vui lòng mời Bot #${missing.botIndex} vào Server để phát cùng lúc ở cả 2 phòng nhé.`,
                        inviteUrl: inviteUrl,
                        needsInvite: true
                    });
                }

                const busyMsg = (botResult.busyList && botResult.busyList.length > 0)
                    ? `\n\n📌 Trạng thái các Bot:\n${botResult.busyList.join('\n')}`
                    : '';
                return res.status(400).json({
                    error: `Tất cả các Bot (${bot.clients.length} bot) hiện đang bận phục vụ người nghe ở các phòng khác!${busyMsg}\n\n💡 Mẹo: Bạn có thể thêm DISCORD_TOKEN_2, DISCORD_TOKEN_3 trong file .env trên Pterodactyl để mở rộng thêm bot vào các phòng khác cùng lúc!`
                });
            }

            const chosenBot = botResult.bot;

            // Kiểm tra quyền của bot trong kênh thoại
            const permissions = targetVoice.permissionsFor(chosenBot.user);
            if (permissions && (!permissions.has('Connect') || !permissions.has('Speak'))) {
                return res.status(403).json({
                    error: `Bot #${chosenBot.botIndex} (${chosenBot.user.username}) không có quyền Tham gia hoặc Nói trong kênh thoại "${targetVoice.name}"!`
                });
            }

            const user = req.session.user;

            try {
                const result = await musicManager.enqueue(
                    guildId,
                    targetVoice,
                    trackData || query,
                    user,
                    null,
                    chosenBot,
                    Boolean(playNow)
                );
                res.json({
                    success: true,
                    result,
                    voiceChannel: {
                        id: targetVoice.id,
                        name: targetVoice.name
                    },
                    bot: {
                        id: chosenBot.user.id,
                        username: chosenBot.user.username,
                        index: chosenBot.botIndex
                    }
                });
            } catch (err) {
                console.error('[Play Error]:', err.message);
                res.status(500).json({ error: err.message });
            }
        });

        this.app.post('/api/guilds/:id/control', (req, res) => {
            if (!req.session.user || !req.session.user.id || req.session.user.id === 'dashboard') {
                return res.status(401).json({ error: 'Vui lòng đăng nhập Discord để sử dụng!', loggedIn: false });
            }

            const guildId = req.params.id;
            const userId = req.session.user.id;
            const { action, value, voiceChannelId } = req.body;

            const guild = bot.client ? bot.client.guilds.cache.get(guildId) : null;
            let targetVoiceId = voiceChannelId;
            if (!targetVoiceId && guild) {
                const vs = guild.voiceStates.cache.get(userId);
                if (vs && vs.channelId) targetVoiceId = vs.channelId;
            }

            let player = musicManager.getPlayer(guildId, targetVoiceId);
            if (!player) {
                player = musicManager.getPlayer(guildId);
            }

            if (!player) {
                return res.status(400).json({ error: 'Không tìm thấy bot đang phát nhạc trong phòng của bạn hoặc server này!' });
            }

            switch (action) {
                case 'pause':
                    player.pause();
                    break;
                case 'resume':
                    player.resume();
                    break;
                case 'toggle':
                    if (player.isPaused) player.resume();
                    else player.pause();
                    break;
                case 'skip':
                    player.skip();
                    break;
                case 'previous':
                    player.previous();
                    break;
                case 'seek':
                    player.seek(parseInt(value, 10) || 0);
                    break;
                case 'volume':
                    player.setVolume(parseInt(value, 10) || 80);
                    break;
                case 'loop':
                    player.setLoop(value);
                    break;
                case 'shuffle':
                    player.shuffle();
                    break;
                case 'remove':
                    player.removeTrack(parseInt(value, 10));
                    break;
                case 'jump':
                    player.jumpTo(parseInt(value, 10));
                    break;
                case 'move':
                    if (value && typeof value.from === 'number' && typeof value.to === 'number') {
                        player.moveTrack(value.from, value.to);
                    }
                    break;
                default:
                    return res.status(400).json({ error: 'Hành động không hợp lệ!' });
            }

            res.json({ success: true, player: player.toJSON() });
        });
    }

    setupSockets() {
        this.io.on('connection', (socket) => {
            socket.on('join_guild', (guildId) => {
                socket.join(`guild_${guildId}`);
                const player = musicManager.getPlayer(guildId);
                const guildPlayers = musicManager.getPlayersForGuild(guildId);
                const payload = {
                    ...(player ? player.toJSON() : { guildId, currentTrack: null, queue: [] }),
                    activePlayers: guildPlayers.map(p => p.toJSON())
                };
                socket.emit('player_update', payload);
            });

            socket.on('leave_guild', (guildId) => {
                socket.leave(`guild_${guildId}`);
            });
        });
    }

    startTicker() {
        setInterval(() => {
            for (const player of musicManager.players.values()) {
                if (player.currentTrack && !player.isPaused) {
                    const currentSeconds = player.getPlaybackDuration();
                    const durationSeconds = player.currentTrack.durationSeconds || 0;
                    const progressPercent = durationSeconds > 0 ? Math.min(100, (currentSeconds / durationSeconds) * 100) : 0;

                    this.io.to(`guild_${player.guildId}`).emit('tick', {
                        guildId: player.guildId,
                        voiceChannelId: player.voiceChannelId,
                        botIndex: player.botIndex,
                        isPaused: player.isPaused,
                        currentSeconds,
                        durationSeconds,
                        progressPercent,
                        currentFormatted: musicManager.formatDuration(currentSeconds)
                    });
                }
            }
        }, 1000);
    }

    start() {
        this.server.listen(config.port, () => {
            console.log(`[Craftopia Music API] Sẵn sàng tại: http://localhost:${config.port}`);
            console.log(`[Craftopia Music Domain] Tên miền cấu hình: ${config.domain}`);
        });
    }
}

module.exports = new WebServer();
