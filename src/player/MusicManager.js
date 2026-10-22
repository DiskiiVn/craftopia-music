const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    StreamType
} = require('@discordjs/voice');
const { Ytdl } = require('@distube/ytdl-core');
const yts = require('yt-search');
const EventEmitter = require('events');

class GuildPlayer extends EventEmitter {
    constructor(guildId, manager) {
        super();
        this.guildId = guildId;
        this.manager = manager;
        this.queue = [];
        this.history = [];
        this.currentTrack = null;
        this.audioPlayer = createAudioPlayer();
        this.voiceConnection = null;
        this.textChannelId = null;
        this.voiceChannelId = null;
        this.voiceChannelName = '';
        this.volume = 80;
        this.loopMode = 'off'; // 'off' | 'track' | 'queue'
        this.isPaused = false;
        this.resource = null;
        this.playbackStartTime = 0;
        this.pausedDuration = 0;
        this.pauseStartTime = 0;

        this.setupAudioPlayer();
    }

    setupAudioPlayer() {
        this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
            this.isPaused = false;
            this.manager.emitUpdate(this.guildId);
        });

        this.audioPlayer.on(AudioPlayerStatus.Paused, () => {
            this.isPaused = true;
            this.pauseStartTime = Date.now();
            this.manager.emitUpdate(this.guildId);
        });

        this.audioPlayer.on(AudioPlayerStatus.AutoPaused, () => {
            this.isPaused = true;
            this.manager.emitUpdate(this.guildId);
        });

        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            this.handleTrackEnd();
        });

        this.audioPlayer.on('error', (error) => {
            console.error(`[GuildPlayer ${this.guildId}] AudioPlayer error:`, error.message);
            this.handleTrackEnd();
        });
    }

    async handleTrackEnd() {
        if (!this.currentTrack) return;

        const finishedTrack = this.currentTrack;

        if (this.loopMode === 'track') {
            await this.playTrack(finishedTrack);
            return;
        }

        this.history.unshift(finishedTrack);
        if (this.history.length > 20) this.history.pop();

        if (this.loopMode === 'queue') {
            this.queue.push(finishedTrack);
        }

        if (this.queue.length > 0) {
            const nextTrack = this.queue.shift();
            await this.playTrack(nextTrack);
        } else {
            this.currentTrack = null;
            this.resource = null;
            this.manager.emitUpdate(this.guildId);
            this.manager.emit('queueEmpty', { guildId: this.guildId, textChannelId: this.textChannelId });
        }
    }

    async join(voiceChannel, textChannelId = null) {
        this.textChannelId = textChannelId || this.textChannelId;
        this.voiceChannelId = voiceChannel.id;
        this.voiceChannelName = voiceChannel.name;

        const needsNewConnection = !this.voiceConnection ||
            this.voiceConnection.state.status === VoiceConnectionStatus.Destroyed ||
            (this.voiceConnection.joinConfig && this.voiceConnection.joinConfig.channelId !== voiceChannel.id);

        if (needsNewConnection) {
            if (this.voiceConnection && this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed) {
                try { this.voiceConnection.destroy(); } catch {}
            }

            this.voiceConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });

            this.voiceConnection.subscribe(this.audioPlayer);

            this.voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(this.voiceConnection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5000)
                    ]);
                } catch {
                    this.destroy();
                }
            });
        }

        // CRUCIAL: Await Ready state so Discord UDP voice socket is 100% connected
        if (this.voiceConnection.state.status !== VoiceConnectionStatus.Ready) {
            try {
                await entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 15000);
            } catch (err) {
                console.error(`[GuildPlayer ${this.guildId}] Failed to reach Voice Ready state:`, err.message);
            }
        }

        return this.voiceConnection;
    }

    async playTrack(track, seekSeconds = 0) {
        try {
            this.currentTrack = track;
            this.playbackStartTime = Date.now() - (seekSeconds * 1000);
            this.pausedDuration = 0;
            this.pauseStartTime = 0;

            const ytdl = this.manager.ytdl;
            const stream = ytdl.download(track.url, {
                filter: { hasAudio: true, hasVideo: false },
                highWaterMark: 1 << 25,
                begin: seekSeconds > 0 ? `${seekSeconds}s` : undefined
            });

            stream.on('error', (err) => {
                console.error(`[GuildPlayer ${this.guildId}] YTDL stream error:`, err.message);
            });

            this.resource = createAudioResource(stream, {
                inlineVolume: true
            });

            if (this.resource.volume) {
                this.resource.volume.setVolumeLogarithmic(this.volume / 100);
            }

            this.audioPlayer.play(this.resource);
            this.manager.emitUpdate(this.guildId);
            this.manager.emit('trackStart', {
                guildId: this.guildId,
                track,
                textChannelId: this.textChannelId
            });
        } catch (error) {
            console.error(`[GuildPlayer ${this.guildId}] Error playing track:`, error.message);
            this.handleTrackEnd();
        }
    }

    getPlaybackDuration() {
        if (!this.currentTrack) return 0;
        if (this.isPaused) {
            return Math.max(0, Math.floor((this.pauseStartTime - this.playbackStartTime - this.pausedDuration) / 1000));
        }
        return Math.max(0, Math.floor((Date.now() - this.playbackStartTime - this.pausedDuration) / 1000));
    }

    pause() {
        if (this.audioPlayer.state.status === AudioPlayerStatus.Playing) {
            this.audioPlayer.pause();
            this.isPaused = true;
            this.pauseStartTime = Date.now();
            this.manager.emitUpdate(this.guildId);
            return true;
        }
        return false;
    }

    resume() {
        if (this.audioPlayer.state.status === AudioPlayerStatus.Paused) {
            if (this.pauseStartTime > 0) {
                this.pausedDuration += (Date.now() - this.pauseStartTime);
            }
            this.audioPlayer.unpause();
            this.isPaused = false;
            this.manager.emitUpdate(this.guildId);
            return true;
        }
        return false;
    }

    skip() {
        if (!this.currentTrack) return false;
        this.audioPlayer.stop();
        return true;
    }

    previous() {
        if (this.getPlaybackDuration() > 5 || this.history.length === 0) {
            if (this.currentTrack) {
                this.playTrack(this.currentTrack);
                return true;
            }
            return false;
        }

        const prevTrack = this.history.shift();
        if (this.currentTrack) {
            this.queue.unshift(this.currentTrack);
        }
        this.playTrack(prevTrack);
        return true;
    }

    seek(seconds) {
        if (!this.currentTrack) return false;
        const target = Math.max(0, Math.min(seconds, this.currentTrack.durationSeconds || 9999));
        this.playTrack(this.currentTrack, target);
        return true;
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(vol, 150));
        if (this.resource && this.resource.volume) {
            this.resource.volume.setVolumeLogarithmic(this.volume / 100);
        }
        this.manager.emitUpdate(this.guildId);
        return this.volume;
    }

    setLoop(mode) {
        if (['off', 'track', 'queue'].includes(mode)) {
            this.loopMode = mode;
        } else {
            this.loopMode = this.loopMode === 'off' ? 'track' : this.loopMode === 'track' ? 'queue' : 'off';
        }
        this.manager.emitUpdate(this.guildId);
        return this.loopMode;
    }

    shuffle() {
        if (this.queue.length <= 1) return this.queue;
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        this.manager.emitUpdate(this.guildId);
        return this.queue;
    }

    removeTrack(index) {
        if (index === -1) {
            this.queue = [];
            this.manager.emitUpdate(this.guildId);
            return true;
        }
        if (index >= 0 && index < this.queue.length) {
            const removed = this.queue.splice(index, 1)[0];
            this.manager.emitUpdate(this.guildId);
            return removed;
        }
        return null;
    }

    destroy() {
        this.queue = [];
        this.currentTrack = null;
        this.audioPlayer.stop(true);
        if (this.voiceConnection) {
            try {
                this.voiceConnection.destroy();
            } catch {}
            this.voiceConnection = null;
        }
        this.manager.emitUpdate(this.guildId);
        this.manager.players.delete(this.guildId);
    }

    toJSON() {
        const currentSeconds = this.getPlaybackDuration();
        const durationSeconds = this.currentTrack ? (this.currentTrack.durationSeconds || 0) : 0;
        const progressPercent = durationSeconds > 0 ? Math.min(100, (currentSeconds / durationSeconds) * 100) : 0;

        return {
            guildId: this.guildId,
            voiceChannelId: this.voiceChannelId,
            voiceChannelName: this.voiceChannelName,
            textChannelId: this.textChannelId,
            isPaused: this.isPaused,
            volume: this.volume,
            loopMode: this.loopMode,
            currentSeconds,
            durationSeconds,
            progressPercent,
            currentTrack: this.currentTrack ? {
                ...this.currentTrack,
                progressSeconds: currentSeconds
            } : null,
            queue: this.queue.map((t, idx) => ({ ...t, queueIndex: idx })),
            queueLength: this.queue.length
        };
    }
}

class MusicManager extends EventEmitter {
    constructor() {
        super();
        this.players = new Map();
        this.ytdl = new Ytdl();
        this.io = null;
    }

    setSocketIO(io) {
        this.io = io;
    }

    emitUpdate(guildId) {
        const player = this.players.get(guildId);
        const data = player ? player.toJSON() : { guildId, currentTrack: null, queue: [] };
        if (this.io) {
            this.io.to(`guild_${guildId}`).emit('player_update', data);
        }
        this.emit('update', { guildId, data });
    }

    getPlayer(guildId) {
        return this.players.get(guildId) || null;
    }

    getOrCreatePlayer(guildId) {
        let player = this.players.get(guildId);
        if (!player) {
            player = new GuildPlayer(guildId, this);
            this.players.set(guildId, player);
        }
        return player;
    }

    async search(query, limit = 12) {
        try {
            if (!query || !query.trim()) return [];

            if (query.includes('youtube.com/watch') || query.includes('youtu.be/')) {
                const searchRes = await yts({ videoId: this.extractVideoId(query) });
                if (searchRes) {
                    return [{
                        id: searchRes.videoId,
                        title: searchRes.title,
                        artist: searchRes.author ? searchRes.author.name : 'Unknown Artist',
                        url: searchRes.url,
                        thumbnail: searchRes.thumbnail || searchRes.image,
                        durationFormatted: searchRes.timestamp || '0:00',
                        durationSeconds: searchRes.seconds || 0
                    }];
                }
            }

            const res = await yts(query);
            const videos = (res && res.videos) ? res.videos.slice(0, limit) : [];

            return videos.map(video => ({
                id: video.videoId,
                title: video.title,
                artist: video.author ? video.author.name : 'Unknown Artist',
                url: video.url,
                thumbnail: video.thumbnail || video.image,
                durationFormatted: video.timestamp || '0:00',
                durationSeconds: video.seconds || 0,
                viewsFormatted: video.views ? video.views.toLocaleString('vi-VN') : '',
                ago: video.ago || ''
            }));
        } catch (error) {
            console.error('[MusicManager] Search error:', error.message);
            return [];
        }
    }

    extractVideoId(url) {
        const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
        return match ? match[1] : url;
    }

    formatDuration(sec) {
        if (!sec || isNaN(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    async enqueue(guildId, voiceChannel, query, requestedBy, textChannelId = null) {
        const player = this.getOrCreatePlayer(guildId);
        await player.join(voiceChannel, textChannelId);

        let tracks = [];
        if (typeof query === 'string') {
            tracks = await this.search(query, 1);
        } else if (query && query.url) {
            tracks = [query];
        }

        if (tracks.length === 0) {
            throw new Error('Không tìm thấy bài hát nào phù hợp!');
        }

        const track = {
            ...tracks[0],
            requestedBy: {
                id: requestedBy.id,
                username: requestedBy.username,
                avatar: requestedBy.avatar ? `https://cdn.discordapp.com/avatars/${requestedBy.id}/${requestedBy.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
            }
        };

        if (!player.currentTrack) {
            await player.playTrack(track);
            return { type: 'playing', track, player };
        } else {
            player.queue.push(track);
            this.emitUpdate(guildId);
            return { type: 'queued', track, position: player.queue.length, player };
        }
    }
}

module.exports = new MusicManager();
