const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Routes,
    REST
} = require('discord.js');
const config = require('../../config');
const commands = require('./commands');
const musicManager = require('../player/MusicManager');

const BRAND_COLOR = 0x1DB954;

function createProgressBar(currentSec, totalSec, size = 15) {
    if (!totalSec || totalSec <= 0) return '🔘' + '▬'.repeat(size);
    const progress = Math.min(Math.floor((currentSec / totalSec) * size), size);
    const emptyProgress = size - progress;
    return '▬'.repeat(progress) + '🟢' + '▬'.repeat(Math.max(0, emptyProgress));
}

class DiscordMusicBotPool {
    constructor() {
        this.tokens = config.tokens && config.tokens.length > 0
            ? config.tokens
            : (config.token ? [config.token] : []);

        this.clients = [];
        this.setupClients();
        this.setupGlobalEvents();
    }

    // Backward-compatible primary client getter
    get client() {
        return this.clients[0] || null;
    }

    setupClients() {
        this.clients = this.tokens.map((tok, index) => {
            const client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildVoiceStates,
                    GatewayIntentBits.GuildMessages
                ]
            });

            client.botIndex = index + 1;
            client.botToken = tok;

            client.once('ready', async () => {
                console.log(`[Craftopia Music Pool] Bot #${client.botIndex} (${client.user.tag}) đã online!`);

                // Register Slash Commands for each bot
                try {
                    const rest = new REST({ version: '10' }).setToken(tok);
                    await rest.put(
                        Routes.applicationCommands(client.user.id),
                        { body: commands.map(cmd => cmd.toJSON()) }
                    );
                    console.log(`[Craftopia Music Pool] Bot #${client.botIndex} đã đăng ký Slash Commands thành công!`);
                } catch (err) {
                    console.error(`[Craftopia Music Pool] Lỗi đăng ký Slash Commands cho Bot #${client.botIndex}:`, err.message);
                }

                client.user.setActivity(`🎵 #${client.botIndex} | music.craftopics.online`, { type: 2 });
            });

            // Slash command interactions
            client.on('interactionCreate', async (interaction) => {
                if (interaction.isChatInputCommand()) {
                    await this.handleCommand(interaction, client);
                } else if (interaction.isButton()) {
                    await this.handleButton(interaction, client);
                }
            });

            return client;
        });
    }

    setupGlobalEvents() {
        // Track Start Notification directly into Voice Channel Text Chat
        musicManager.on('trackStart', async ({ guildId, track, voiceChannelId, textChannelId, botClient, botIndex }) => {
            try {
                const sendingClient = botClient || this.getBotInVoice(guildId, voiceChannelId) || this.client;
                if (!sendingClient || !sendingClient.isReady()) return;

                const player = musicManager.getPlayer(guildId, voiceChannelId);
                const targetChannelId = voiceChannelId || player?.voiceChannelId || textChannelId;
                if (!targetChannelId) return;

                let channel = await sendingClient.channels.fetch(targetChannelId).catch(() => null);
                if (!channel || !channel.isTextBased()) {
                    if (textChannelId && textChannelId !== targetChannelId) {
                        channel = await sendingClient.channels.fetch(textChannelId).catch(() => null);
                    }
                }
                if (!channel || !channel.isTextBased()) return;

                if (channel.guild) {
                    const permissions = channel.permissionsFor(sendingClient.user);
                    if (permissions && (!permissions.has('ViewChannel') || !permissions.has('SendMessages'))) {
                        return;
                    }
                }

                const requesterText = (track.requestedBy?.id && track.requestedBy.id !== 'dashboard')
                    ? `<@${track.requestedBy.id}>`
                    : (track.requestedBy?.username || 'Web Dashboard');

                const upcomingQueue = player?.queue || [];
                let queueFieldText = '*(Hàng đợi hiện đang trống)*';
                if (upcomingQueue.length > 0) {
                    const queueLines = upcomingQueue.slice(0, 3).map((t, idx) => {
                        const tReq = (t.requestedBy?.id && t.requestedBy.id !== 'dashboard')
                            ? `<@${t.requestedBy.id}>`
                            : (t.requestedBy?.username || 'Web');
                        return `\`#${idx + 1}\` [${t.title}](${t.url}) - \`${t.durationFormatted}\` (bởi ${tReq})`;
                    });
                    queueFieldText = queueLines.join('\n');
                    if (upcomingQueue.length > 3) {
                        queueFieldText += `\n*...và còn **${upcomingQueue.length - 3}** bài hát nữa trong hàng đợi*`;
                    }
                }

                const voiceName = player?.voiceChannelName || (channel.isVoiceBased() ? channel.name : 'Voice Channel');
                const botTag = sendingClient.user.username;
                const botBadge = `Bot #${botIndex || sendingClient.botIndex || 1} (${botTag})`;

                const embed = new EmbedBuilder()
                    .setColor(BRAND_COLOR)
                    .setAuthor({
                        name: `ĐANG PHÁT TRONG PHÒNG VOICE • ${botBadge} 🔊`,
                        iconURL: sendingClient.user.displayAvatarURL() || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop'
                    })
                    .setTitle(`🎵 ${track.title}`)
                    .setURL(track.url)
                    .setDescription(`**Nghệ sĩ:** ${track.artist}\n**Thời lượng:** \`${track.durationFormatted}\``)
                    .addFields(
                        {
                            name: '👤 Người chọn bài',
                            value: requesterText,
                            inline: true
                        },
                        {
                            name: '🔊 Phòng thoại',
                            value: `\`${voiceName}\``,
                            inline: true
                        },
                        {
                            name: '🤖 Bot phục vụ',
                            value: `\`${botBadge}\``,
                            inline: true
                        },
                        {
                            name: '🎚️ Âm lượng',
                            value: `\`${player?.volume || 80}%\``,
                            inline: true
                        },
                        {
                            name: `📋 Hàng đợi tiếp theo (${upcomingQueue.length} bài chờ)`,
                            value: queueFieldText,
                            inline: false
                        }
                    )
                    .setThumbnail(track.thumbnail)
                    .setFooter({
                        text: `Craftopia Music • Tự động đồng bộ với Dashboard (${config.domain})`,
                        iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png'
                    })
                    .setTimestamp();

                const dashboardUrl = `${config.domain}?guild=${guildId}`;
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`btn_pause_${guildId}`)
                        .setLabel('Phát / Dừng')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⏯️'),
                    new ButtonBuilder()
                        .setCustomId(`btn_skip_${guildId}`)
                        .setLabel('Bỏ qua')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⏭️'),
                    new ButtonBuilder()
                        .setCustomId(`btn_loop_${guildId}`)
                        .setLabel('Lặp bài')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔁'),
                    new ButtonBuilder()
                        .setLabel('Mở Web Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(dashboardUrl)
                        .setEmoji('🌐')
                );

                await channel.send({ embeds: [embed], components: [row] });
            } catch (err) {
                console.error('[Craftopia Music] Lỗi gửi thông báo trackStart vào voice:', err.message);
            }
        });

        // Track Added to Queue Notification
        musicManager.on('trackAdd', async ({ guildId, track, position, voiceChannelId, textChannelId, botClient, botIndex }) => {
            try {
                const sendingClient = botClient || this.getBotInVoice(guildId, voiceChannelId) || this.client;
                if (!sendingClient || !sendingClient.isReady()) return;

                const player = musicManager.getPlayer(guildId, voiceChannelId);
                const targetChannelId = voiceChannelId || player?.voiceChannelId || textChannelId;
                if (!targetChannelId) return;

                let channel = await sendingClient.channels.fetch(targetChannelId).catch(() => null);
                if (!channel || !channel.isTextBased()) return;

                if (channel.guild) {
                    const permissions = channel.permissionsFor(sendingClient.user);
                    if (permissions && (!permissions.has('ViewChannel') || !permissions.has('SendMessages'))) {
                        return;
                    }
                }

                const requesterText = (track.requestedBy?.id && track.requestedBy.id !== 'dashboard')
                    ? `<@${track.requestedBy.id}>`
                    : (track.requestedBy?.username || 'Web Dashboard');

                const embed = new EmbedBuilder()
                    .setColor(0x06B6D4)
                    .setAuthor({
                        name: `ĐÃ THÊM VÀO HÀNG ĐỢI (Bot #${botIndex || sendingClient.botIndex || 1}) ➕`,
                        iconURL: sendingClient.user.displayAvatarURL()
                    })
                    .setTitle(`➕ ${track.title}`)
                    .setURL(track.url)
                    .setDescription(`**Nghệ sĩ:** ${track.artist}\n**Thời lượng:** \`${track.durationFormatted}\``)
                    .addFields(
                        { name: '👤 Người chọn bài', value: requesterText, inline: true },
                        { name: '🔢 Vị trí trong hàng đợi', value: `\`#${position}\``, inline: true },
                        { name: '📋 Tổng số bài đang chờ', value: `\`${player?.queue?.length || position} bài\``, inline: true }
                    )
                    .setThumbnail(track.thumbnail)
                    .setFooter({ text: 'Craftopia Music Studio' })
                    .setTimestamp();

                await channel.send({ embeds: [embed] });
            } catch (err) {
                console.error('[Craftopia Music] Lỗi gửi thông báo trackAdd vào voice:', err.message);
            }
        });
    }

    getBotInVoice(guildId, voiceChannelId) {
        if (!voiceChannelId) return null;
        for (const client of this.clients) {
            if (!client.isReady()) continue;
            const g = client.guilds.cache.get(guildId);
            if (g && g.members.me?.voice?.channelId === voiceChannelId) {
                return client;
            }
        }
        return null;
    }

    /**
     * Dispatch an available bot for a requested voice channel.
     * 1. If a bot is already connected to this channel, use it.
     * 2. Otherwise find a bot in the pool that is idle (not connected to any channel in this server).
     */
    getAvailableBotForVoice(guildId, voiceChannelId) {
        // 1. Is there already a bot inside this voice channel?
        const currentBot = this.getBotInVoice(guildId, voiceChannelId);
        if (currentBot) {
            return { bot: currentBot, isExisting: true };
        }

        const existingPlayer = musicManager.getPlayerByVoice(guildId, voiceChannelId);
        if (existingPlayer && existingPlayer.botClient) {
            return { bot: existingPlayer.botClient, isExisting: true };
        }

        // 2. Find a free bot that belongs to this guild and is idle
        const busyList = [];
        const missingFromGuild = [];

        for (const client of this.clients) {
            if (!client.isReady()) continue;
            const g = client.guilds.cache.get(guildId);
            if (!g) {
                missingFromGuild.push(client);
                continue;
            }

            const activeVoiceId = g.members.me?.voice?.channelId;
            const player = musicManager.getPlayer(guildId, null, client.user.id);
            const isBusy = !!activeVoiceId || (player && player.currentTrack && player.voiceChannelId);

            if (!isBusy) {
                return { bot: client, isExisting: false };
            } else {
                const vId = activeVoiceId || player?.voiceChannelId;
                const ch = g.channels.cache.get(vId);
                const chName = ch ? ch.name : vId;
                busyList.push(`• **Bot #${client.botIndex} (${client.user.username})**: đang phát ở phòng \`#${chName}\``);
            }
        }

        return {
            bot: null,
            busyList,
            missingFromGuild,
            totalBots: this.clients.length
        };
    }

    async handleCommand(interaction, invokingClient) {
        const { commandName, guildId, member, channel } = interaction;
        const voiceChannel = member?.voice?.channel;
        const dashboardUrl = `${config.domain}?guild=${guildId}`;

        if (commandName === 'dashboard') {
            const embed = new EmbedBuilder()
                .setColor(BRAND_COLOR)
                .setTitle('🎧 Craftopia Music Web Dashboard')
                .setDescription(`Điều khiển âm nhạc trực tiếp theo thời gian thực tại tên miền chính thức:\n\n🔗 **[Mở Craftopia Music Dashboard](${dashboardUrl})**\n*(Domain: \`${config.domain}\`)*`)
                .addFields(
                    { name: '✨ Cụm Multi-Bot', value: `Hệ thống hỗ trợ đồng thời **${this.clients.length} Bot** phục vụ nhiều phòng voice cùng lúc.`, inline: false },
                    { name: '✨ Tính năng', value: '• Tìm kiếm bài hát trực tiếp\n• Tự động quét phòng voice khi phát\n• Tua bài hát theo từng giây\n• Tăng giảm âm lượng & xáo trộn\n• Chế độ toàn màn hình Theater Mode', inline: false }
                )
                .setThumbnail('https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Mở Web Dashboard')
                    .setStyle(ButtonStyle.Link)
                    .setURL(dashboardUrl)
                    .setEmoji('🎧')
            );

            return interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
        }

        if (!voiceChannel) {
            return interaction.reply({
                content: '❌ Bạn phải vào một **Kênh thoại (Voice Channel)** trước để sử dụng lệnh này!',
                ephemeral: true
            });
        }

        // Get player corresponding to user's voice channel
        let player = musicManager.getPlayer(guildId, voiceChannel.id);
        if (!player) {
            player = musicManager.getPlayer(guildId, null, invokingClient.user.id) || musicManager.getPlayer(guildId);
        }

        switch (commandName) {
            case 'play': {
                const query = interaction.options.getString('query');
                await interaction.deferReply();

                // Select appropriate bot from pool
                const botResult = this.getAvailableBotForVoice(guildId, voiceChannel.id);
                let chosenBot = botResult.bot;

                if (!chosenBot) {
                    const busyDesc = botResult.busyList.length > 0
                        ? `\n\n📌 **Trạng thái các bot hiện tại:**\n${botResult.busyList.join('\n')}`
                        : '';
                    return interaction.editReply({
                        content: `❌ **Tất cả các Bot (${botResult.totalBots} bot) hiện đều đang bận phát nhạc ở các phòng khác!**${busyDesc}\n\n💡 *Gợi ý: Thêm \`DISCORD_TOKEN_2\`, \`DISCORD_TOKEN_3\` vào file .env trên Pterodactyl để mở rộng thêm bot phục vụ song song nhiều phòng nhé!*`
                    });
                }

                try {
                    const result = await musicManager.enqueue(
                        guildId,
                        voiceChannel,
                        query,
                        interaction.user,
                        channel.id,
                        chosenBot
                    );

                    const track = result.track;
                    const embed = new EmbedBuilder()
                        .setColor(BRAND_COLOR)
                        .setThumbnail(track.thumbnail);

                    const botNotice = chosenBot.id !== invokingClient.user.id
                        ? `\n*(Điều phối **Bot #${chosenBot.botIndex} (${chosenBot.user.username})** vào phục vụ phòng của bạn)*`
                        : '';

                    if (result.type === 'playing') {
                        embed
                            .setTitle('▶️ Đang phát bài hát')
                            .setDescription(`[${track.title}](${track.url})\n\n**Nghệ sĩ:** ${track.artist}\n**Thời lượng:** \`${track.durationFormatted}\`${botNotice}`);
                    } else {
                        embed
                            .setTitle('➕ Đã thêm vào hàng đợi')
                            .setDescription(`[${track.title}](${track.url})\n\n**Vị trí:** \`#${result.position}\`\n**Thời lượng:** \`${track.durationFormatted}\`${botNotice}`);
                    }

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Mở Web Dashboard')
                            .setStyle(ButtonStyle.Link)
                            .setURL(dashboardUrl)
                            .setEmoji('🎧')
                    );

                    return interaction.editReply({ embeds: [embed], components: [row] });
                } catch (err) {
                    return interaction.editReply({
                        content: `❌ Lỗi: ${err.message}`
                    });
                }
            }

            case 'pause': {
                if (!player || !player.currentTrack) {
                    return interaction.reply({ content: '❌ Hiện tại không có bài hát nào đang phát trong phòng của bạn!', ephemeral: true });
                }
                const paused = player.pause();
                return interaction.reply(paused ? '⏸️ Đã tạm dừng phát nhạc!' : '⚠️ Bài hát đã ở trạng thái tạm dừng từ trước!');
            }

            case 'resume': {
                if (!player || !player.currentTrack) {
                    return interaction.reply({ content: '❌ Hiện tại không có bài hát nào đang phát trong phòng của bạn!', ephemeral: true });
                }
                const resumed = player.resume();
                return interaction.reply(resumed ? '▶️ Đã tiếp tục phát nhạc!' : '⚠️ Bài hát đang phát bình thường!');
            }

            case 'skip': {
                if (!player || !player.currentTrack) {
                    return interaction.reply({ content: '❌ Không có bài hát nào để bỏ qua!', ephemeral: true });
                }
                player.skip();
                return interaction.reply('⏭️ Đã bỏ qua bài hát hiện tại!');
            }

            case 'previous': {
                if (!player) {
                    return interaction.reply({ content: '❌ Không có bài hát nào!', ephemeral: true });
                }
                const ok = player.previous();
                return interaction.reply(ok ? '⏮️ Đã quay lại bài hát trước hoặc phát lại từ đầu!' : '❌ Không có bài hát trước đó để phát!');
            }

            case 'stop': {
                if (!player) {
                    return interaction.reply({ content: '❌ Bot hiện không phát nhạc trong phòng của bạn!', ephemeral: true });
                }
                player.destroy();
                return interaction.reply('⏹️ Đã dừng phát nhạc, dọn dẹp hàng đợi và rời phòng!');
            }

            case 'nowplaying': {
                if (!player || !player.currentTrack) {
                    return interaction.reply({ content: '❌ Hiện tại không có bài hát nào đang phát trong phòng của bạn!', ephemeral: true });
                }
                const track = player.currentTrack;
                const curSec = player.getPlaybackDuration();
                const totalSec = track.durationSeconds || 0;
                const bar = createProgressBar(curSec, totalSec, 16);

                const embed = new EmbedBuilder()
                    .setColor(BRAND_COLOR)
                    .setAuthor({ name: `CRAFTOPIA MUSIC • BOT #${player.botIndex || 1}`, iconURL: player.botUser?.displayAvatarURL() || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop' })
                    .setTitle(track.title)
                    .setURL(track.url)
                    .setDescription(`**Nghệ sĩ:** ${track.artist}\n\n\`${musicManager.formatDuration(curSec)}\` ${bar} \`${track.durationFormatted}\`\n\n**Phòng thoại:** \`${player.voiceChannelName}\`\n**Âm lượng:** \`${player.volume}%\` | **Lặp:** \`${player.loopMode.toUpperCase()}\``)
                    .setThumbnail(track.thumbnail)
                    .setFooter({ text: `Yêu cầu bởi ${track.requestedBy ? track.requestedBy.username : 'Dashboard'}` });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Điều khiển trên Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(dashboardUrl)
                        .setEmoji('🎧')
                );

                return interaction.reply({ embeds: [embed], components: [row] });
            }

            case 'queue': {
                if (!player || (!player.currentTrack && player.queue.length === 0)) {
                    return interaction.reply({ content: '📭 Hàng đợi trong phòng của bạn hiện đang trống!', ephemeral: true });
                }

                let desc = `**Phòng thoại:** \`${player.voiceChannelName}\` *(Bot #${player.botIndex || 1})*\n**Bài đang phát:**\n▶️ [${player.currentTrack.title}](${player.currentTrack.url}) - \`${player.currentTrack.durationFormatted}\`\n\n**Hàng đợi tiếp theo:**\n`;

                if (player.queue.length === 0) {
                    desc += '*Không có bài hát tiếp theo. Hãy thêm bài mới bằng /play hoặc trên Dashboard!*';
                } else {
                    player.queue.slice(0, 10).forEach((t, i) => {
                        desc += `**${i + 1}.** [${t.title}](${t.url}) - \`${t.durationFormatted}\` *(bởi ${t.requestedBy ? t.requestedBy.username : 'User'})*\n`;
                    });
                    if (player.queue.length > 10) {
                        desc += `\n*... và ${player.queue.length - 10} bài hát khác.*`;
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor(BRAND_COLOR)
                    .setTitle(`📋 Hàng đợi phát nhạc (${player.queue.length + (player.currentTrack ? 1 : 0)} bài)`)
                    .setDescription(desc);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Quản lý Queue trên Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(dashboardUrl)
                        .setEmoji('🎧')
                );

                return interaction.reply({ embeds: [embed], components: [row] });
            }

            case 'volume': {
                if (!player) {
                    return interaction.reply({ content: '❌ Bot chưa kết nối vào kênh voice của bạn!', ephemeral: true });
                }
                const level = interaction.options.getInteger('level');
                player.setVolume(level);
                return interaction.reply(`🔊 Đã điều chỉnh âm lượng thành **${level}%**!`);
            }

            case 'loop': {
                if (!player) {
                    return interaction.reply({ content: '❌ Bot chưa kết nối vào kênh voice của bạn!', ephemeral: true });
                }
                const mode = interaction.options.getString('mode');
                player.setLoop(mode);
                const modeName = mode === 'track' ? 'Lặp bài hiện tại' : mode === 'queue' ? 'Lặp cả danh sách' : 'Tắt lặp';
                return interaction.reply(`🔁 Chế độ lặp: **${modeName}**!`);
            }

            case 'shuffle': {
                if (!player || player.queue.length === 0) {
                    return interaction.reply({ content: '❌ Hàng đợi trống, không có gì để xáo trộn!', ephemeral: true });
                }
                player.shuffle();
                return interaction.reply(`🔀 Đã xáo trộn ngẫu nhiên **${player.queue.length}** bài hát trong hàng đợi!`);
            }
        }
    }

    async handleButton(interaction, invokingClient) {
        const { customId, guildId, member } = interaction;
        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Bạn phải vào kênh Voice để điều khiển nút này!', ephemeral: true });
        }

        let player = musicManager.getPlayer(guildId, voiceChannel.id);
        if (!player) {
            player = musicManager.getPlayer(guildId, null, invokingClient.user.id) || musicManager.getPlayer(guildId);
        }

        if (!player) {
            return interaction.reply({ content: '❌ Hiện không có bài hát nào đang phát trong phòng của bạn!', ephemeral: true });
        }

        if (customId.startsWith('btn_pause_')) {
            if (player.isPaused) {
                player.resume();
                return interaction.reply({ content: '▶️ Đã tiếp tục phát nhạc!', ephemeral: true });
            } else {
                player.pause();
                return interaction.reply({ content: '⏸️ Đã tạm dừng nhạc!', ephemeral: true });
            }
        } else if (customId.startsWith('btn_skip_')) {
            player.skip();
            return interaction.reply({ content: '⏭️ Đã bỏ qua bài hát!', ephemeral: true });
        } else if (customId.startsWith('btn_loop_')) {
            const nextMode = player.setLoop();
            const modeText = nextMode === 'track' ? 'Lặp bài hiện tại' : nextMode === 'queue' ? 'Lặp cả danh sách' : 'Tắt lặp';
            return interaction.reply({ content: `🔁 Chế độ lặp: **${modeText}**`, ephemeral: true });
        }
    }

    async start() {
        if (this.clients.length === 0) {
            console.error('[Craftopia Music Pool] Chưa cung cấp DISCORD_TOKEN trong file .env hoặc config.js!');
            return;
        }

        console.log(`[Craftopia Music Pool] Đang khởi động ${this.clients.length} bot trong cụm Multi-Bot...`);
        const loginPromises = this.clients.map((client, idx) => {
            return client.login(client.botToken).catch((err) => {
                console.error(`[Craftopia Music Pool] Lỗi đăng nhập Bot #${idx + 1}:`, err.message);
            });
        });

        await Promise.allSettled(loginPromises);
    }
}

module.exports = new DiscordMusicBotPool();
