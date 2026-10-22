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

class DiscordMusicBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages
            ]
        });

        this.setupEvents();
    }

    setupEvents() {
        this.client.once('ready', async () => {
            console.log(`[Craftopia Music] Đã đăng nhập bot thành công: ${this.client.user.tag}`);

            // Register Slash Commands
            try {
                const rest = new REST({ version: '10' }).setToken(config.token);
                console.log('[Craftopia Music] Đang đăng ký Application (Slash) Commands...');
                await rest.put(
                    Routes.applicationCommands(this.client.user.id),
                    { body: commands.map(cmd => cmd.toJSON()) }
                );
                console.log('[Craftopia Music] Đã đăng ký Slash Commands thành công!');
            } catch (err) {
                console.error('[Craftopia Music] Lỗi khi đăng ký Slash Commands:', err.message);
            }

            this.client.user.setActivity('🎵 music.craftopics.online | /play', { type: 2 });
        });

        // Slash command interactions
        this.client.on('interactionCreate', async (interaction) => {
            if (interaction.isChatInputCommand()) {
                await this.handleCommand(interaction);
            } else if (interaction.isButton()) {
                await this.handleButton(interaction);
            }
        });

        // Track Start Notifications in Text Channel
        musicManager.on('trackStart', async ({ guildId, track, textChannelId }) => {
            if (!textChannelId) return;
            try {
                const channel = await this.client.channels.fetch(textChannelId).catch(() => null);
                if (!channel || !channel.isTextBased()) return;

                const embed = new EmbedBuilder()
                    .setColor(BRAND_COLOR)
                    .setAuthor({ name: 'CRAFTOPIA MUSIC', iconURL: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop' })
                    .setTitle(track.title)
                    .setURL(track.url)
                    .setDescription(`**Nghệ sĩ:** ${track.artist}\n**Thời lượng:** \`${track.durationFormatted}\`\n**Yêu cầu bởi:** ${track.requestedBy ? track.requestedBy.username : 'Web Dashboard'}`)
                    .setThumbnail(track.thumbnail)
                    .setFooter({ text: 'Dùng /dashboard hoặc vào music.craftopics.online để điều khiển' });

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
                        .setLabel('Lặp')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔁'),
                    new ButtonBuilder()
                        .setLabel('Mở Web Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(dashboardUrl)
                        .setEmoji('🎧')
                );

                await channel.send({ embeds: [embed], components: [row] });
            } catch (err) {
                console.error('[Craftopia Music] Lỗi gửi thông báo bài hát:', err.message);
            }
        });
    }

    async handleCommand(interaction) {
        const { commandName, guildId, member, channel } = interaction;
        const voiceChannel = member?.voice?.channel;
        const dashboardUrl = `${config.domain}?guild=${guildId}`;

        if (commandName === 'dashboard') {
            const embed = new EmbedBuilder()
                .setColor(BRAND_COLOR)
                .setTitle('🎧 Craftopia Music Web Dashboard')
                .setDescription(`Điều khiển âm nhạc trực tiếp theo thời gian thực tại tên miền chính thức:\n\n🔗 **[Mở Craftopia Music Dashboard](${dashboardUrl})**\n*(Domain: \`${config.domain}\`)*`)
                .addFields(
                    { name: '✨ Tính năng', value: '• Tìm kiếm bài hát trực tiếp\n• Tua bài hát theo từng giây\n• Tăng giảm âm lượng & xáo trộn\n• Chế độ toàn màn hình Theater Mode', inline: false }
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

        const player = musicManager.getPlayer(guildId);

        switch (commandName) {
            case 'play': {
                const query = interaction.options.getString('query');
                await interaction.deferReply();

                try {
                    const result = await musicManager.enqueue(
                        guildId,
                        voiceChannel,
                        query,
                        interaction.user,
                        channel.id
                    );

                    const track = result.track;
                    const embed = new EmbedBuilder()
                        .setColor(BRAND_COLOR)
                        .setThumbnail(track.thumbnail);

                    if (result.type === 'playing') {
                        embed
                            .setTitle('▶️ Đang phát bài hát')
                            .setDescription(`[${track.title}](${track.url})\n\n**Nghệ sĩ:** ${track.artist}\n**Thời lượng:** \`${track.durationFormatted}\``);
                    } else {
                        embed
                            .setTitle('➕ Đã thêm vào hàng đợi')
                            .setDescription(`[${track.title}](${track.url})\n\n**Vị trí:** \`#${result.position}\`\n**Thời lượng:** \`${track.durationFormatted}\``);
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
                    return interaction.reply({ content: '❌ Hiện tại không có bài hát nào đang phát!', ephemeral: true });
                }
                const paused = player.pause();
                return interaction.reply(paused ? '⏸️ Đã tạm dừng phát nhạc!' : '⚠️ Bài hát đã ở trạng thái tạm dừng từ trước!');
            }

            case 'resume': {
                if (!player || !player.currentTrack) {
                    return interaction.reply({ content: '❌ Hiện tại không có bài hát nào đang phát!', ephemeral: true });
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
                    return interaction.reply({ content: '❌ Bot hiện không phát nhạc!', ephemeral: true });
                }
                player.destroy();
                return interaction.reply('⏹️ Đã dừng phát nhạc, dọn dẹp hàng đợi và rời phòng!');
            }

            case 'nowplaying': {
                if (!player || !player.currentTrack) {
                    return interaction.reply({ content: '❌ Hiện tại không có bài hát nào đang phát!', ephemeral: true });
                }
                const track = player.currentTrack;
                const curSec = player.getPlaybackDuration();
                const totalSec = track.durationSeconds || 0;
                const bar = createProgressBar(curSec, totalSec, 16);

                const embed = new EmbedBuilder()
                    .setColor(BRAND_COLOR)
                    .setAuthor({ name: 'CRAFTOPIA MUSIC', iconURL: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop' })
                    .setTitle(track.title)
                    .setURL(track.url)
                    .setDescription(`**Nghệ sĩ:** ${track.artist}\n\n\`${musicManager.formatDuration(curSec)}\` ${bar} \`${track.durationFormatted}\`\n\n**Âm lượng:** \`${player.volume}%\` | **Lặp:** \`${player.loopMode.toUpperCase()}\``)
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
                    return interaction.reply({ content: '📭 Hàng đợi hiện đang trống!', ephemeral: true });
                }

                let desc = `**Bài đang phát:**\n▶️ [${player.currentTrack.title}](${player.currentTrack.url}) - \`${player.currentTrack.durationFormatted}\`\n\n**Hàng đợi tiếp theo:**\n`;

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
                    return interaction.reply({ content: '❌ Bot chưa kết nối vào kênh voice!', ephemeral: true });
                }
                const level = interaction.options.getInteger('level');
                player.setVolume(level);
                return interaction.reply(`🔊 Đã điều chỉnh âm lượng thành **${level}%**!`);
            }

            case 'loop': {
                if (!player) {
                    return interaction.reply({ content: '❌ Bot chưa kết nối vào kênh voice!', ephemeral: true });
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

    async handleButton(interaction) {
        const { customId, guildId, member } = interaction;
        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Bạn phải vào kênh Voice để điều khiển nút này!', ephemeral: true });
        }

        const player = musicManager.getPlayer(guildId);
        if (!player) {
            return interaction.reply({ content: '❌ Hiện không có bài hát nào đang phát!', ephemeral: true });
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
        if (!config.token) {
            console.error('[Craftopia Music] Chưa cung cấp DISCORD_TOKEN trong file .env hoặc config.js!');
            return;
        }
        await this.client.login(config.token);
    }
}

module.exports = new DiscordMusicBot();
