const axios = require('axios');

class LyricsService {
    constructor() {
        this.cache = new Map();
        this.client = axios.create({
            baseURL: 'https://lrclib.net/api',
            timeout: 6000,
            headers: {
                'User-Agent': 'CraftopiaMusic/2.0 (https://music.craftopics.online; contact@craftopics.online)'
            }
        });
    }

    cleanTitle(rawTitle = '', rawArtist = '') {
        let title = (rawTitle || '').trim();
        // Remove music video noise, brackets, audio tags, quality tags
        title = title.replace(/\s*[\(\[](?:official|music|video|audio|lyrics?|mv|hd|4k|remix|prod\.|feat\.|ft\.|visualizer)[^\)\]]*[\)\]]/gi, '');
        title = title.replace(/[\(\[].*?[\)\]]/g, '');

        let artist = (rawArtist || '').trim();
        if (title.includes(' - ')) {
            const parts = title.split(' - ');
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
        } else if (title.includes(' | ')) {
            const parts = title.split(' | ');
            artist = parts[0].trim();
            title = parts.slice(1).join(' | ').trim();
        }

        return {
            track: title.trim(),
            artist: artist.trim()
        };
    }

    parseLRC(lrcText) {
        if (!lrcText) return [];
        const lines = [];
        const regex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;
        const rawLines = lrcText.split('\n');

        for (const raw of rawLines) {
            const match = raw.match(regex);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseFloat(match[2]);
                const time = Math.round((minutes * 60 + seconds) * 100) / 100;
                const text = match[3].trim();
                if (text) {
                    lines.push({ time, text });
                }
            }
        }

        return lines;
    }

    async getLyrics(rawTitle, rawArtist = '', duration = 0) {
        const cleaned = this.cleanTitle(rawTitle, rawArtist);
        const cacheKey = `${cleaned.track.toLowerCase()}__${cleaned.artist.toLowerCase()}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // 1. Try exact search with track and artist
            let searchQuery = `${cleaned.track} ${cleaned.artist}`.trim();
            let res = await this.client.get('/search', {
                params: { q: searchQuery }
            }).catch(() => null);

            let items = res?.data || [];

            // 2. If nothing found, try searching just by track name
            if (items.length === 0 && cleaned.track) {
                res = await this.client.get('/search', {
                    params: { q: cleaned.track }
                }).catch(() => null);
                items = res?.data || [];
            }

            if (items.length > 0) {
                // Prioritize items that have syncedLyrics
                const best = items.find(i => i.syncedLyrics) || items[0];

                if (best.syncedLyrics) {
                    const result = {
                        found: true,
                        synced: true,
                        trackName: best.trackName || cleaned.track,
                        artistName: best.artistName || cleaned.artist,
                        lines: this.parseLRC(best.syncedLyrics)
                    };
                    this.cache.set(cacheKey, result);
                    return result;
                }

                if (best.plainLyrics) {
                    const rawLines = best.plainLyrics.split('\n').map(l => l.trim()).filter(Boolean);
                    const dur = duration || best.duration || 180;
                    const step = dur / Math.max(1, rawLines.length);

                    const lines = rawLines.map((text, idx) => ({
                        time: Math.round(idx * step * 10) / 10,
                        text
                    }));

                    const result = {
                        found: true,
                        synced: false,
                        trackName: best.trackName || cleaned.track,
                        artistName: best.artistName || cleaned.artist,
                        lines
                    };
                    this.cache.set(cacheKey, result);
                    return result;
                }
            }
        } catch (err) {
            console.error('[LyricsService] Error searching lyrics:', err.message);
        }

        const notFoundResult = {
            found: false,
            synced: false,
            trackName: cleaned.track,
            artistName: cleaned.artist,
            lines: []
        };
        this.cache.set(cacheKey, notFoundResult);
        return notFoundResult;
    }
}

module.exports = new LyricsService();
