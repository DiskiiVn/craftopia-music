require('dotenv').config();

const domain = process.env.APP_DOMAIN || 'https://music.craftopics.online';

// Parse all bot tokens (Support single bot or Multi-Bot Pool)
const tokens = [];
if (process.env.DISCORD_TOKENS) {
    tokens.push(...process.env.DISCORD_TOKENS.split(',').map(s => s.trim()).filter(Boolean));
}
if (process.env.DISCORD_TOKEN && !tokens.includes(process.env.DISCORD_TOKEN)) {
    tokens.unshift(process.env.DISCORD_TOKEN);
}
for (let i = 2; i <= 10; i++) {
    const t = process.env[`DISCORD_TOKEN_${i}`];
    if (t && !tokens.includes(t)) {
        tokens.push(t);
    }
}

module.exports = {
    // Discord Bot Credentials (Primary & Pool)
    token: tokens[0] || '',
    tokens: tokens,
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',

    // Domain & Web Dashboard Configuration
    domain: domain,
    port: parseInt(process.env.SERVER_PORT || process.env.PORT, 10) || 3000,
    redirectUri: process.env.REDIRECT_URI || `${domain}/api/auth/callback`,
    sessionSecret: process.env.SESSION_SECRET || 'craftopia_music_secret_2026',

    // Default Player Settings
    defaultVolume: 80,
    defaultLoop: 'off', // 'off' | 'track' | 'queue'
};
