require('dotenv').config();

const domain = process.env.APP_DOMAIN || 'https://music.craftopics.online';

module.exports = {
    // Discord Bot Credentials
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',

    // Domain & Web Dashboard Configuration
    domain: domain,
    port: parseInt(process.env.PORT, 10) || 3000,
    redirectUri: process.env.REDIRECT_URI || `${domain}/api/auth/callback`,
    sessionSecret: process.env.SESSION_SECRET || 'craftopia_music_secret_2026',

    // Default Player Settings
    defaultVolume: 80,
    defaultLoop: 'off', // 'off' | 'track' | 'queue'
};
