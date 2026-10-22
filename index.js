const fs = require('fs');
try {
    const ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
        process.env.FFMPEG_PATH = ffmpegPath;
    }
} catch (e) {}

const bot = require('./src/bot/bot');
const server = require('./src/server/server');

console.log('========================================================');
console.log('   🎵 CRAFTOPIA MUSIC - DISCORD BOT & WEB DASHBOARD 🎵   ');
console.log('========================================================');

// Start Web Server
server.start();

// Start Discord Bot
bot.start().catch((err) => {
    console.error('[Discord Bot Error]:', err.message);
    console.log('\n👉 Vui lòng kiểm tra file .env hoặc config.js để điền DISCORD_TOKEN hợp lệ!');
});
