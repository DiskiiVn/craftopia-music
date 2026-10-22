require('dotenv').config();

module.exports = {
    // Discord Bot Credentials
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',

    // Web Dashboard Configuration
    port: parseInt(process.env.PORT, 10) || 3000,
    redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
    sessionSecret: process.env.SESSION_SECRET || 'rythm_spotify_secret_key_2026',

    // Default Player Settings
    defaultVolume: 80,
    defaultLoop: 'off', // 'off' | 'track' | 'queue'
};
