const { SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát một bài hát từ YouTube hoặc link trên Discord')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Tên bài hát, từ khoá tìm kiếm hoặc đường dẫn URL')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Tạm dừng bài hát đang phát'),

    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Tiếp tục phát bài hát đang tạm dừng'),

    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Bỏ qua bài hát hiện tại sang bài kế tiếp'),

    new SlashCommandBuilder()
        .setName('previous')
        .setDescription('Phát lại từ đầu hoặc quay lại bài hát trước đó'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Dừng phát nhạc, xoá hàng đợi và rời khỏi voice'),

    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Xem danh sách các bài hát trong hàng đợi phát'),

    new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Xem thông tin chi tiết bài hát đang phát và thanh thời lượng'),

    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Điều chỉnh âm lượng bài hát (0 - 150%)')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Mức âm lượng (ví dụ: 80)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(150)
        ),

    new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Chế độ lặp lại bài hát hoặc toàn bộ danh sách')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Chọn chế độ lặp')
                .setRequired(true)
                .addChoices(
                    { name: 'Tắt lặp (Off)', value: 'off' },
                    { name: 'Lặp bài hiện tại (Track)', value: 'track' },
                    { name: 'Lặp cả danh sách (Queue)', value: 'queue' }
                )
        ),

    new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Xáo trộn ngẫu nhiên thứ tự các bài hát trong hàng đợi'),

    new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Mở Web Dashboard Craftopia Music để điều khiển bot trực quan')
];

module.exports = commands;
