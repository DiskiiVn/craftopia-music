const axios = require('axios');

class LyricsService {
    constructor() {
        this.cache = new Map();
        this.lrclib = axios.create({
            baseURL: 'https://lrclib.net/api',
            timeout: 6000,
            headers: {
                'User-Agent': 'CraftopiaMusic/2.0 (https://music.craftopics.online; contact@craftopics.online)'
            }
        });
        this.lyricsOvh = axios.create({
            baseURL: 'https://api.lyrics.ovh/v1',
            timeout: 5000
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

        // 1. Normalize unicode dashes: en-dash, em-dash, etc. to regular '-'
        t = t.replace(/[\u2010-\u2015\u2212]/g, '-');

        // 2. Remove bracketed junk: [OFFICIAL MV], (Official Music Video), (Lyric Video), [4K], [feat. ...], etc.
        t = t.replace(/\s*[\(\[](?:official|music\s*video|audio|lyrics?|mv|hd|4k|remix|prod\.|feat\.|ft\.|visualizer|vietsub|video|nhạc\s*trẻ|m\/v)[^\)\]]*[\)\]]/gi, '').trim();

        const junkRegex = /^(?:official\s*(?:music)?\s*(?:video|audio|mv|lyrics?)?|music\s*video|mv|audio|lyrics?|video\s*lyric|hd|4k|karaoke|full\s*hd|teaser|trailer|vietsub)$/i;

        // 3. Multi-level segmentation: split by '|', then further split by ' - '
        let segments = [];
        const pipeParts = t.split(/\s*\|\s*/).map(p => p.trim()).filter(p => p && !junkRegex.test(p));

        for (const p of pipeParts) {
            if (p.includes(' - ')) {
                const sub = p.split(/\s+-\s+/).map(s => s.trim()).filter(s => s && !junkRegex.test(s));
                segments.push(...sub);
            } else {
                segments.push(p);
            }
        }

        let detectedTrack = t;
        let detectedArtist = a;

        if (segments.length >= 2) {
            const seg0 = segments[0];
            const seg1 = segments[1];

            // Compare with artist string
            const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
            const clean0 = seg0.toLowerCase().replace(/[^a-z0-9]/g, '');
            const clean1 = seg1.toLowerCase().replace(/[^a-z0-9]/g, '');

            if (cleanA && (clean0.includes(cleanA) || cleanA.includes(clean0))) {
                detectedArtist = seg0;
                detectedTrack = seg1;
            } else if (cleanA && (clean1.includes(cleanA) || cleanA.includes(clean1))) {
                detectedArtist = seg1;
                detectedTrack = seg0;
            } else {
                detectedArtist = seg0;
                detectedTrack = seg1;
            }
        } else if (segments.length === 1) {
            detectedTrack = segments[0];
        }

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

        // Try LRCLIB first for synchronized lyrics
        try {
            const directCandidates = [
                { track_name: cleaned.track, artist_name: cleaned.primaryArtist },
                { track_name: cleaned.track, artist_name: cleaned.artist },
                { track_name: cleaned.track, artist_name: rawArtist },
                { track_name: this.stripDiacritics(cleaned.track), artist_name: this.stripDiacritics(cleaned.primaryArtist) },
                { track_name: this.stripDiacritics(cleaned.track), artist_name: this.stripDiacritics(cleaned.artist) }
            ];

            for (const params of directCandidates) {
                if (!params.track_name || !params.artist_name) continue;
                try {
                    const res = await this.lrclib.get('/get', { params });
                    if (res.data && (res.data.syncedLyrics || res.data.plainLyrics)) {
                        const result = this.formatResult(res.data, cleaned.track, cleaned.primaryArtist, duration);
                        this.cache.set(cacheKey, result);
                        return result;
                    }
                } catch (e) {}
            }

            // Fuzzy queries via /api/search
            const searchCandidates = [
                cleaned.primaryArtist,
                `${cleaned.track} ${cleaned.primaryArtist}`.trim(),
                cleaned.track,
                this.stripDiacritics(cleaned.track)
            ];

            for (const query of searchCandidates) {
                if (!query) continue;
                try {
                    const res = await this.lrclib.get('/search', { params: { q: query } });
                    const items = res.data || [];
                    if (items.length > 0) {
                        // Find matching track name
                        const cleanT = cleaned.track.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const match = items.find(i => {
                            const iT = (i.trackName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                            return (cleanT && (iT.includes(cleanT) || cleanT.includes(iT))) && i.syncedLyrics;
                        }) || items.find(i => i.syncedLyrics) || items[0];

                        if (match && (match.syncedLyrics || match.plainLyrics)) {
                            const result = this.formatResult(match, cleaned.track, cleaned.primaryArtist, duration);
                            this.cache.set(cacheKey, result);
                            return result;
                        }
                    }
                } catch (e) {}
            }
        } catch (err) {
            console.error('[LyricsService] Error searching lrclib:', err.message);
        }

        // Fallback: Try lyrics.ovh for plain lyrics
        try {
            const ovhRes = await this.lyricsOvh.get(`/${encodeURIComponent(cleaned.primaryArtist)}/${encodeURIComponent(cleaned.track)}`);
            if (ovhRes.data && ovhRes.data.lyrics) {
                const rawLines = ovhRes.data.lyrics.split('\n').map(l => l.trim()).filter(Boolean);
                const dur = duration || 200;
                const step = dur / Math.max(1, rawLines.length);
                const lines = rawLines.map((text, idx) => ({
                    time: Math.round(idx * step * 10) / 10,
                    text
                }));

                const result = {
                    found: true,
                    synced: false,
                    trackName: cleaned.track,
                    artistName: cleaned.primaryArtist,
                    lines
                };
                this.cache.set(cacheKey, result);
                return result;
            }
        } catch (e) {}

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
