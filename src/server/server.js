const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const axios = require('axios');
const config = require('../../config');
const musicManager = require('../player/MusicManager');
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
        this.app.use(cors({
            origin: true,
            credentials: true
        }));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(session({
            secret: config.sessionSecret,
            resave: false,
            saveUninitialized: true,
            cookie: {
                maxAge: 7 * 24 * 60 * 60 * 1000,
                secure: process.env.NODE_ENV === 'production',
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
                botReady: bot.client.isReady()
            });
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

                req.session.user = {
                    id: userRes.data.id,
                    username: userRes.data.username,
                    avatar: userRes.data.avatar 
                        ? `https://cdn.discordapp.com/avatars/${userRes.data.id}/${userRes.data.avatar}.png` 
                        : 'https://cdn.discordapp.com/embed/avatars/0.png'
                };

                res.redirect('/');
            } catch (err) {
                console.error('[OAuth2 Error]:', err.response?.data || err.message);
                res.redirect('/?error=auth_failed');
            }
        });

        this.app.get('/api/auth/me', (req, res) => {
            if (req.session.user) {
                return res.json({ loggedIn: true, user: req.session.user });
            }
            res.json({
                loggedIn: false,
                user: {
                    id: 'dashboard',
                    username: 'Khách (Dashboard)',
                    avatar: 'https://cdn.discordapp.com/embed/avatars/0.png'
                }
            });
        });

        this.app.get('/api/auth/logout', (req, res) => {
            req.session.destroy(() => {
                res.json({ success: true });
            });
        });

        // --- Guilds API ---
        this.app.get('/api/guilds', (req, res) => {
            if (!bot.client.isReady()) {
                return res.json({ guilds: [] });
            }

            const guilds = bot.client.guilds.cache.map(g => ({
                id: g.id,
                name: g.name,
                icon: g.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png',
                memberCount: g.memberCount,
                hasActivePlayer: !!musicManager.getPlayer(g.id)
            }));

            res.json({ guilds });
        });

        this.app.get('/api/guilds/:id', (req, res) => {
            const guildId = req.params.id;
            const guild = bot.client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ error: 'Bot không tham gia Server này!' });
            }

            const voiceChannels = guild.channels.cache
                .filter(c => c.isVoiceBased())
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    membersCount: c.members.size,
                    members: c.members.map(m => ({
                        id: m.id,
                        username: m.user.username,
                        avatar: m.user.avatarURL() || 'https://cdn.discordapp.com/embed/avatars/0.png'
                    }))
                }));

            const player = musicManager.getPlayer(guildId);
            res.json({
                guild: {
                    id: guild.id,
                    name: guild.name,
                    icon: guild.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png'
                },
                voiceChannels,
                player: player ? player.toJSON() : { guildId, currentTrack: null, queue: [] }
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

        // --- Player Controls API ---
        this.app.post('/api/guilds/:id/join', async (req, res) => {
            const guildId = req.params.id;
            const { voiceChannelId } = req.body;
            const guild = bot.client.guilds.cache.get(guildId);
            if (!guild) return res.status(404).json({ error: 'Server không tìm thấy!' });

            const channel = guild.channels.cache.get(voiceChannelId);
            if (!channel || !channel.isVoiceBased()) {
                return res.status(400).json({ error: 'Kênh voice không hợp lệ!' });
            }

            const player = musicManager.getOrCreatePlayer(guildId);
            await player.join(channel);
            musicManager.emitUpdate(guildId);
            res.json({ success: true, message: `Đã kết nối vào ${channel.name}` });
        });

        this.app.post('/api/guilds/:id/leave', (req, res) => {
            const guildId = req.params.id;
            const player = musicManager.getPlayer(guildId);
            if (player) {
                player.destroy();
            }
            res.json({ success: true, message: 'Bot đã rời kênh voice' });
        });

        this.app.post('/api/guilds/:id/play', async (req, res) => {
            const guildId = req.params.id;
            const { query, voiceChannelId, trackData } = req.body;
            const guild = bot.client.guilds.cache.get(guildId);
            if (!guild) return res.status(404).json({ error: 'Server không tìm thấy!' });

            let player = musicManager.getPlayer(guildId);
            let targetVoice = null;

            if (voiceChannelId) {
                targetVoice = guild.channels.cache.get(voiceChannelId);
            }
            if (!targetVoice && player && player.voiceChannelId) {
                targetVoice = guild.channels.cache.get(player.voiceChannelId);
            }
            if (!targetVoice && req.session.user && req.session.user.id) {
                const member = guild.members.cache.get(req.session.user.id);
                if (member && member.voice && member.voice.channel) {
                    targetVoice = member.voice.channel;
                }
            }
            if (!targetVoice) {
                const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
                const withHumans = voiceChannels.find(c => c.members.some(m => !m.user.bot));
                targetVoice = withHumans || voiceChannels.find(c => c.members.size > 0) || voiceChannels.first();
            }

            if (!targetVoice) {
                return res.status(400).json({ error: 'Không tìm thấy kênh voice nào trong server để phát nhạc!' });
            }

            const user = req.session.user || {
                id: 'dashboard',
                username: 'Web Dashboard',
                avatar: null
            };

            try {
                const result = await musicManager.enqueue(
                    guildId,
                    targetVoice,
                    trackData || query,
                    user
                );
                res.json({ success: true, result });
            } catch (err) {
                console.error('[Play Error]:', err.message);
                res.status(500).json({ error: err.message });
            }
        });

        this.app.post('/api/guilds/:id/control', (req, res) => {
            const guildId = req.params.id;
            const { action, value } = req.body;
            const player = musicManager.getPlayer(guildId);

            if (!player) {
                return res.status(400).json({ error: 'Bot chưa kết nối vào kênh voice trong server này!' });
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
                socket.emit('player_update', player ? player.toJSON() : { guildId, currentTrack: null, queue: [] });
            });

            socket.on('leave_guild', (guildId) => {
                socket.leave(`guild_${guildId}`);
            });
        });
    }

    startTicker() {
        setInterval(() => {
            for (const [guildId, player] of musicManager.players.entries()) {
                if (player.currentTrack && !player.isPaused) {
                    const currentSeconds = player.getPlaybackDuration();
                    const durationSeconds = player.currentTrack.durationSeconds || 0;
                    const progressPercent = durationSeconds > 0 ? Math.min(100, (currentSeconds / durationSeconds) * 100) : 0;

                    this.io.to(`guild_${guildId}`).emit('tick', {
                        guildId,
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
