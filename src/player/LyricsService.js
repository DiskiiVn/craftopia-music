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

    stripDiacritics(str = '') {
        return (str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

    cleanTitleAndArtist(rawTitle = '', rawArtist = '') {
        let t = (rawTitle || '').trim();
        let a = (rawArtist || '').trim();

        // 1. Remove bracketed noise: [OFFICIAL MV], (Official Music Video), (Lyric Video), [4K], etc.
        t = t.replace(/\s*[\(\[](?:official|music\s*video|audio|lyrics?|mv|hd|4k|remix|prod\.|feat\.|ft\.|visualizer|vietsub|video|nhạc\s*trẻ|m\/v)[^\)\]]*[\)\]]/gi, '').trim();

        const junkRegex = /^(?:official\s*(?:music)?\s*(?:video|audio|mv|lyrics?)?|music\s*video|mv|audio|lyrics?|video\s*lyric|hd|4k|karaoke|full\s*hd|teaser|trailer|vietsub)$/i;

        let detectedTrack = t;
        let detectedArtist = a;

        // Split by pipe '|' first as YouTube titles use it for major delimiters
        if (t.includes('|')) {
            const parts = t.split(/\s*\|\s*/).map(p => p.trim()).filter(p => p && !junkRegex.test(p));
            if (parts.length >= 2) {
                detectedArtist = parts[0];
                detectedTrack = parts[1];
            } else if (parts.length === 1) {
                detectedTrack = parts[0];
            }
        } else if (t.includes(' - ')) {
            const parts = t.split(/\s+-\s+/).map(p => p.trim()).filter(p => p && !junkRegex.test(p));
            if (parts.length >= 2) {
                detectedArtist = parts[0];
                detectedTrack = parts[1];
            } else if (parts.length === 1) {
                detectedTrack = parts[0];
            }
        }

        // Clean YouTube channel suffix
        detectedArtist = detectedArtist.replace(/\b(?:official|channel|vevo|topic|music)\b/gi, '').trim();
        const primaryArtist = detectedArtist.split(/\b(?:x|feat\.?|ft\.?)\b|&|,/i)[0].trim();

        return {
            track: detectedTrack,
            artist: detectedArtist,
            primaryArtist: primaryArtist || detectedArtist
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
        const cleaned = this.cleanTitleAndArtist(rawTitle, rawArtist);
        const cacheKey = `${cleaned.track.toLowerCase()}__${cleaned.primaryArtist.toLowerCase()}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // Strategy 1: Direct exact match via /api/get
            const directCandidates = [
                { track_name: cleaned.track, artist_name: cleaned.primaryArtist },
                { track_name: cleaned.track, artist_name: cleaned.artist },
                { track_name: this.stripDiacritics(cleaned.track), artist_name: this.stripDiacritics(cleaned.primaryArtist) },
                { track_name: cleaned.track, artist_name: rawArtist }
            ];

            for (const params of directCandidates) {
                if (!params.track_name || !params.artist_name) continue;
                try {
                    const res = await this.client.get('/get', { params });
                    if (res.data && (res.data.syncedLyrics || res.data.plainLyrics)) {
                        const result = this.formatResult(res.data, cleaned.track, cleaned.primaryArtist, duration);
                        this.cache.set(cacheKey, result);
                        return result;
                    }
                } catch (e) {
                    // Ignore 404 / error and continue to next candidate
                }
            }

            // Strategy 2: Fuzzy search queries via /api/search
            const searchCandidates = [
                `${cleaned.track} ${cleaned.primaryArtist}`.trim(),
                `${this.stripDiacritics(cleaned.track)} ${this.stripDiacritics(cleaned.primaryArtist)}`.trim(),
                cleaned.track,
                this.stripDiacritics(cleaned.track)
            ];

            for (const query of searchCandidates) {
                if (!query) continue;
                try {
                    const res = await this.client.get('/search', { params: { q: query } });
                    const items = res.data || [];
                    if (items.length > 0) {
                        const best = items.find(i => i.syncedLyrics) || items[0];
                        if (best && (best.syncedLyrics || best.plainLyrics)) {
                            const result = this.formatResult(best, cleaned.track, cleaned.primaryArtist, duration);
                            this.cache.set(cacheKey, result);
                            return result;
                        }
                    }
                } catch (e) {
                    // Continue to next candidate
                }
            }
        } catch (err) {
            console.error('[LyricsService] Error searching lyrics:', err.message);
        }

        const notFoundResult = {
            found: false,
            synced: false,
            trackName: cleaned.track,
            artistName: cleaned.primaryArtist,
            lines: []
        };
        this.cache.set(cacheKey, notFoundResult);
        return notFoundResult;
    }

    formatResult(data, fallbackTrack, fallbackArtist, duration = 0) {
        if (data.syncedLyrics) {
            return {
                found: true,
                synced: true,
                trackName: data.trackName || fallbackTrack,
                artistName: data.artistName || fallbackArtist,
                lines: this.parseLRC(data.syncedLyrics)
            };
        }

        if (data.plainLyrics) {
            const rawLines = data.plainLyrics.split('\n').map(l => l.trim()).filter(Boolean);
            const dur = duration || data.duration || 180;
            const step = dur / Math.max(1, rawLines.length);

            const lines = rawLines.map((text, idx) => ({
                time: Math.round(idx * step * 10) / 10,
                text
            }));

            return {
                found: true,
                synced: false,
                trackName: data.trackName || fallbackTrack,
                artistName: data.artistName || fallbackArtist,
                lines
            };
        }

        return {
            found: false,
            synced: false,
            trackName: fallbackTrack,
            artistName: fallbackArtist,
            lines: []
        };
    }
}

module.exports = new LyricsService();
