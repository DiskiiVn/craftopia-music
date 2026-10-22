// Craftopia Music Dashboard Client
const savedBackend = localStorage.getItem('craftopia_backend_url');
const BACKEND_URL = (savedBackend && !savedBackend.includes('onrender.com')) ? savedBackend : '';

const socket = io(BACKEND_URL, {
    transports: ['polling', 'websocket']
});

// State
let currentGuildId = localStorage.getItem('craftopia_selected_guild') || null;
let currentPlayerData = null;
let currentDuration = 0;
let currentSeconds = 0;
let isSeeking = false;
let isAdjustingVolume = false;
let searchTimeout = null;
let lastVolume = 80;
let guildLoadRetries = 0;

// In-memory cache for search results
window.currentSearchResults = [];

// DOM Elements
const guildSelect = document.getElementById('guild-select');
const guildList = document.getElementById('guild-list');
const guildCountBadge = document.getElementById('guild-count-badge');
const navItems = document.querySelectorAll('.nav-item');
const tabViews = document.querySelectorAll('.tab-view');
const topSearchInput = document.getElementById('top-search-input');
const userBadgeBtn = document.getElementById('user-badge-btn');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// Voice Box & Modal
const voiceBox = document.getElementById('voice-box');
const voiceChannelName = document.getElementById('voice-channel-name');
const voiceChannelSub = document.getElementById('voice-channel-sub');
const btnOpenVoiceModal = document.getElementById('btn-open-voice-modal');
const voiceModal = document.getElementById('voice-modal');
const voiceChannelSelect = document.getElementById('voice-channel-select');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalConnect = document.getElementById('btn-modal-connect');

// Hero Showcase & Vinyl
const heroArt = document.getElementById('hero-art');
const heroTitle = document.getElementById('hero-title');
const heroArtist = document.getElementById('hero-artist');
const heroMeta = document.getElementById('hero-meta');
const heroVisualizer = document.getElementById('hero-visualizer');
const heroStatusLabel = document.getElementById('hero-status-label');
const heroPlayBtn = document.getElementById('hero-play-btn');
const heroPlayIcon = document.getElementById('hero-play-icon');
const heroSkipBtn = document.getElementById('hero-skip-btn');
const heroSearchShortcut = document.getElementById('hero-search-shortcut');
const heroTheaterBtn = document.getElementById('hero-theater-btn');
const vinylDisc = document.getElementById('vinyl-disc');
const heroBgArt = document.getElementById('hero-bg-art');
const sidebarQueueCount = document.getElementById('sidebar-queue-count');
const queueStatsText = document.getElementById('queue-stats-text');
const hotTracksContainer = document.getElementById('hot-tracks-container');
const btnModalCloseIcon = document.getElementById('btn-modal-close-icon');

// Queue Tables
const homeQueueTbody = document.getElementById('home-queue-tbody');
const fullQueueTbody = document.getElementById('full-queue-tbody');
const queueShuffleBtn = document.getElementById('queue-shuffle-btn');
const queueClearBtn = document.getElementById('queue-clear-btn');

// Search Tab
const searchResultsGrid = document.getElementById('search-results-grid');
const searchStatus = document.getElementById('search-status');

// Bottom Player Bar
const barThumb = document.getElementById('bar-thumb');
const barTitle = document.getElementById('bar-title');
const barArtist = document.getElementById('bar-artist');
const barVoiceBadge = document.getElementById('bar-voice-badge');
const ctrlPlayIcon = document.getElementById('ctrl-play-icon');
const btnCtrlPlay = document.getElementById('btn-ctrl-play');
const btnCtrlNext = document.getElementById('btn-ctrl-next');
const btnCtrlPrev = document.getElementById('btn-ctrl-prev');
const btnCtrlShuffle = document.getElementById('btn-ctrl-shuffle');
const btnCtrlLoop = document.getElementById('btn-ctrl-loop');
const barHeartBtn = document.getElementById('bar-heart-btn');

// Sliders & Tooltips
const seekCurrent = document.getElementById('seek-current');
const seekTotal = document.getElementById('seek-total');
const seekSlider = document.getElementById('seek-slider');
const seekProgress = document.getElementById('seek-progress');
const seekThumb = document.getElementById('seek-thumb');
const seekTooltip = document.getElementById('seek-tooltip');

const btnVolumeIcon = document.getElementById('btn-volume-icon');
const volSlider = document.getElementById('vol-slider');
const volProgress = document.getElementById('vol-progress');
const volThumb = document.getElementById('vol-thumb');

// Theater Mode Elements
const theaterModal = document.getElementById('theater-modal');
const theaterBackdrop = document.getElementById('theater-backdrop');
const theaterArt = document.getElementById('theater-art');
const theaterTitle = document.getElementById('theater-title');
const theaterArtist = document.getElementById('theater-artist');
const theaterVoiceBadge = document.getElementById('theater-voice-badge');
const theaterPlayBtn = document.getElementById('theater-play-btn');
const theaterPlayIcon = document.getElementById('theater-play-icon');
const theaterSkipBtn = document.getElementById('theater-skip-btn');
const btnCloseTheater = document.getElementById('btn-close-theater');
const btnToggleTheater = document.getElementById('btn-toggle-theater');

// Toast Container
const toastContainer = document.getElementById('toast-container');

// Toast Notifications
function showToast(message, icon = '🎵') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

// Quick Category Search
window.quickSearch = (keyword) => {
    topSearchInput.value = keyword;
    triggerSearch(keyword);
    showToast(`Đang tìm danh mục: ${keyword}`, '🔍');
};

async function triggerSearch(query) {
    if (!query) {
        searchStatus.textContent = 'Nhập từ khoá vào thanh tìm kiếm phía trên...';
        searchResultsGrid.innerHTML = '';
        return;
    }

    switchTab('tab-search');
    searchStatus.innerHTML = `<span style="color:var(--primary-light);">⏳ Đang tìm kiếm "${query}" trên YouTube...</span>`;

    try {
        const res = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderSearchResults(data.results || []);
    } catch (err) {
        searchStatus.textContent = 'Lỗi tìm kiếm: ' + err.message;
    }
}

function setupSearch() {
    topSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);

        if (!query) {
            searchStatus.textContent = 'Nhập từ khoá vào thanh tìm kiếm phía trên...';
            searchResultsGrid.innerHTML = '';
            return;
        }

        searchTimeout = setTimeout(() => {
            triggerSearch(query);
        }, 350);
    });

    topSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            triggerSearch(topSearchInput.value.trim());
        }
    });
}

function renderSearchResults(results) {
    window.currentSearchResults = results;

    if (!results || results.length === 0) {
        searchStatus.textContent = 'Không tìm thấy kết quả phù hợp. Hãy thử từ khoá khác!';
        searchResultsGrid.innerHTML = '';
        return;
    }

    searchStatus.innerHTML = `Tìm thấy <b>${results.length}</b> bài hát phù hợp (Click bài bất kỳ để phát):`;
    searchResultsGrid.innerHTML = results.map((song, idx) => `
        <div class="song-card" onclick="playSongByIndex(${idx})">
            <div class="song-card-thumb-wrap">
                <img class="song-card-thumb" src="${song.thumbnail}" alt="${song.title}">
                <button class="card-play-btn" title="Phát ngay">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
            </div>
            <div class="song-card-title" title="${song.title}">${song.title}</div>
            <div class="song-card-artist">${song.artist} • ${song.durationFormatted}</div>
        </div>
    `).join('');
}

window.playSongByIndex = async (index) => {
    const song = window.currentSearchResults[index];
    if (!song) return;

    if (!currentGuildId) {
        showToast('Vui lòng chọn Server Discord trước khi phát bài!', '⚠️');
        return;
    }

    try {
        showToast(`🔍 Đang quét phòng voice của bạn và phát: ${song.title}...`, '⏳');
        const res = await fetch(`${BACKEND_URL}/api/guilds/${currentGuildId}/play`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trackData: song
            })
        });
        const data = await res.json();
        if (data.success) {
            switchTab('tab-home');
            const vName = data.voiceChannel ? data.voiceChannel.name : 'voice';
            showToast(`✅ Đã vào [${vName}] & đang phát: ${song.title}`, '▶️');
        } else {
            showToast(data.error || 'Không thể phát bài', '⚠️');
        }
    } catch (err) {
        showToast('Lỗi khi phát bài: ' + err.message, '❌');
    }
};

// --- Curated Hot Tracks Data ---
const HOT_TRACKS = [
    { title: 'Cắt Đôi Nỗi Sầu', artist: 'Tăng Duy Tân, Drum7', duration: '3:05', query: 'Cắt Đôi Nỗi Sầu Tăng Duy Tân', thumb: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150&h=150&fit=crop' },
    { title: 'Thiên Lý Ơi', artist: 'Jack - J97', duration: '3:32', query: 'Thiên Lý Ơi Jack J97', thumb: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=150&h=150&fit=crop' },
    { title: 'Từng Quen', artist: 'Wren Evans', duration: '2:56', query: 'Từng Quen Wren Evans', thumb: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=150&h=150&fit=crop' },
    { title: 'Nơi Này Có Anh', artist: 'Sơn Tùng M-TP', duration: '4:39', query: 'Nơi Này Có Anh Sơn Tùng M-TP', thumb: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=150&h=150&fit=crop' },
    { title: 'Waiting For You', artist: 'MONO, Onionn', duration: '4:25', query: 'Waiting For You MONO', thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&h=150&fit=crop' },
    { title: 'Faded (Official)', artist: 'Alan Walker', duration: '3:32', query: 'Alan Walker Faded official', thumb: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=150&h=150&fit=crop' },
    { title: 'See Tình (Speed Up Remix)', artist: 'Hoàng Thùy Linh', duration: '2:40', query: 'See Tình Hoàng Thùy Linh remix', thumb: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=150&h=150&fit=crop' },
    { title: 'Nevada (Vicetone)', artist: 'Vicetone, Cozi Zuehlsdorff', duration: '3:28', query: 'Vicetone Nevada monstercat', thumb: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=150&h=150&fit=crop' }
];

function renderHotTracks() {
    if (!hotTracksContainer) return;
    hotTracksContainer.innerHTML = HOT_TRACKS.map(t => `
        <div class="hot-track-item" onclick="playTrendingSong('${t.query}', '${t.title}')" title="Phát ngay: ${t.title}">
            <div class="hot-track-thumb-wrap">
                <img class="hot-track-thumb" src="${t.thumb}" alt="${t.title}">
                <div class="hot-track-play-hover">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
            </div>
            <div class="hot-track-info">
                <div class="hot-track-title">${t.title}</div>
                <div class="hot-track-artist">${t.artist}</div>
            </div>
            <div class="hot-track-duration">${t.duration}</div>
        </div>
    `).join('');
}

window.playTrendingSong = async (query, title) => {
    if (!currentGuildId) {
        showToast('Vui lòng chọn Server Discord trước khi phát bài!', '⚠️');
        return;
    }
    showToast(`🔍 Đang tìm kiếm: ${title}...`, '⏳');
    try {
        const res = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const first = data.results && data.results[0];
        if (!first) {
            showToast('Không tìm thấy bài hát trên YouTube!', '❌');
            return;
        }
        showToast(`🔍 Đang quét phòng voice của bạn và phát: ${first.title}...`, '⏳');
        const playRes = await fetch(`${BACKEND_URL}/api/guilds/${currentGuildId}/play`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trackData: first
            })
        });
        const playData = await playRes.json();
        if (playData.success) {
            switchTab('tab-home');
            const vName = playData.voiceChannel ? playData.voiceChannel.name : 'voice';
            showToast(`✅ Đã vào [${vName}] & đang phát: ${first.title}`, '▶️');
        } else {
            showToast(playData.error || 'Không thể phát bài', '⚠️');
        }
    } catch (err) {
        showToast('Lỗi khi phát bài: ' + err.message, '❌');
    }
};

window.playTrendingPlaylist = async (keyword) => {
    window.playTrendingSong(keyword, keyword);
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    setupControls();
    setupSearch();
    setupSeekbar();
    setupVolume();
    setupTheaterMode();
    setupKeyboardShortcuts();
    setupLyricsView();
    setupSleepTimer();
    setupEqualizer();
    setupShortcutsModal();
    renderHotTracks();

    if (btnModalCloseIcon) {
        btnModalCloseIcon.addEventListener('click', () => {
            voiceModal.classList.remove('active');
        });
    }

    await checkAuth();

    // Check URL guild query param
    const urlParams = new URLSearchParams(window.location.search);
    const queryGuild = urlParams.get('guild');
    if (queryGuild) {
        selectGuild(queryGuild);
    }
});

// --- Tab Navigation ---
function setupTabNavigation() {
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            if (targetTab) switchTab(targetTab);
        });
    });

    const mobileBtnVoice = document.getElementById('mobile-btn-voice');
    if (mobileBtnVoice) {
        mobileBtnVoice.addEventListener('click', () => {
            btnOpenVoiceModal.click();
        });
    }

    const playerLeftTouch = document.getElementById('player-left-touch');
    if (playerLeftTouch) {
        playerLeftTouch.addEventListener('click', (e) => {
            if (e.target.closest('#bar-heart-btn')) return;
            if (window.innerWidth <= 768) {
                btnToggleTheater.click();
            }
        });
    }

    heroSearchShortcut.addEventListener('click', () => {
        switchTab('tab-search');
        topSearchInput.focus();
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    tabViews.forEach(view => {
        if (view.id === tabId) {
            view.classList.add('active');
        } else {
            view.classList.remove('active');
        }
    });

    const contentBody = document.querySelector('.content-body');
    if (contentBody) contentBody.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Auth Check & Login Gate ---
async function checkAuth() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/auth/me`);
        const data = await res.json();
        const loginGate = document.getElementById('login-gate');

        if (data && data.loggedIn && data.user) {
            // Đã đăng nhập Discord -> Ẩn Login Gate, hiển thị Dashboard
            if (loginGate) loginGate.classList.add('hidden');
            userName.textContent = data.user.username;
            if (data.user.avatar) userAvatar.src = data.user.avatar;
            userBadgeBtn.title = `Tài khoản: ${data.user.username} (Click để Đăng xuất)`;
            
            // Đăng xuất khi click vào badge user
            userBadgeBtn.onclick = async () => {
                if (confirm(`Bạn có muốn đăng xuất khỏi tài khoản "${data.user.username}" không?`)) {
                    await fetch(`${BACKEND_URL}/api/auth/logout`);
                    window.location.reload();
                }
            };

            await loadGuilds();
        } else {
            // Chưa đăng nhập -> Hiện Login Gate chặn toàn bộ màn hình
            if (loginGate) loginGate.classList.remove('hidden');
        }
    } catch (err) {
        console.error('Lỗi kiểm tra auth:', err);
    }
}

// --- Guilds Loading & Selection with Auto-Retry ---
async function loadGuilds() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/guilds`);
        const data = await res.json();
        const guilds = data.guilds || [];

        if (guilds.length === 0 && guildLoadRetries < 5) {
            guildLoadRetries++;
            setTimeout(loadGuilds, 1000);
            return;
        }

        guildCountBadge.textContent = guilds.length;
        guildSelect.innerHTML = '<option value="">Chọn Server Discord...</option>';
        guildList.innerHTML = '';

        guilds.forEach(guild => {
            const opt = document.createElement('option');
            opt.value = guild.id;
            opt.textContent = guild.name;
            guildSelect.appendChild(opt);

            const card = document.createElement('div');
            card.className = 'guild-card';
            card.id = `sidebar-guild-${guild.id}`;
            card.innerHTML = `
                <img src="${guild.icon}" alt="${guild.name}">
                <div class="guild-card-info">
                    <span class="guild-card-name">${guild.name}</span>
                    <span class="guild-card-status">${guild.hasActivePlayer ? '🟢 Đang phát nhạc' : `${guild.memberCount} thành viên`}</span>
                </div>
            `;
            card.addEventListener('click', () => selectGuild(guild.id));
            guildList.appendChild(card);
        });

        guildSelect.addEventListener('change', (e) => {
            if (e.target.value) selectGuild(e.target.value);
        });

        // Auto select saved or first guild
        if (currentGuildId && guilds.some(g => g.id === currentGuildId)) {
            selectGuild(currentGuildId, true);
        } else if (guilds.length > 0) {
            selectGuild(guilds[0].id);
        }
    } catch (err) {
        console.error('Lỗi tải danh sách Guilds:', err);
    }
}

function selectGuild(guildId, force = false) {
    if (currentGuildId === guildId && !force) return;

    if (currentGuildId && currentGuildId !== guildId) {
        socket.emit('leave_guild', currentGuildId);
        const oldCard = document.getElementById(`sidebar-guild-${currentGuildId}`);
        if (oldCard) oldCard.classList.remove('active');
    }

    currentGuildId = guildId;
    localStorage.setItem('craftopia_selected_guild', guildId);
    guildSelect.value = guildId;

    const newCard = document.getElementById(`sidebar-guild-${guildId}`);
    if (newCard) newCard.classList.add('active');

    socket.emit('join_guild', guildId);

    const newUrl = new URL(window.location);
    newUrl.searchParams.set('guild', guildId);
    window.history.pushState({}, '', newUrl);

    fetchGuildDetails(guildId);
}

async function fetchGuildDetails(guildId) {
    try {
        const res = await fetch(`${BACKEND_URL}/api/guilds/${guildId}`);
        const data = await res.json();
        if (data.voiceChannels) {
            populateVoiceSelect(data.voiceChannels);
        }
        if (data.player) {
            updatePlayerUI(data.player);
        }
    } catch (err) {
        console.error('Lỗi tải thông tin server:', err);
    }
}

function populateVoiceSelect(channels) {
    voiceChannelSelect.innerHTML = '';
    if (channels.length === 0) {
        voiceChannelSelect.innerHTML = '<option value="">Không có kênh thoại nào!</option>';
        return;
    }
    channels.forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.textContent = `🔊 ${ch.name} (${ch.membersCount} người đang nghe)`;
        voiceChannelSelect.appendChild(opt);
    });
}

// --- Voice Modal Handlers ---
btnOpenVoiceModal.addEventListener('click', () => {
    if (!currentGuildId) {
        showToast('Vui lòng chọn một Server Discord trước!', '⚠️');
        return;
    }
    voiceModal.classList.add('active');
});

btnModalCancel.addEventListener('click', () => {
    voiceModal.classList.remove('active');
});

btnModalConnect.addEventListener('click', async () => {
    const channelId = voiceChannelSelect.value;
    if (!channelId || !currentGuildId) return;

    btnModalConnect.textContent = 'Đang kết nối...';
    try {
        await fetch(`${BACKEND_URL}/api/guilds/${currentGuildId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voiceChannelId: channelId })
        });
        voiceModal.classList.remove('active');
        showToast('Bot đã tham gia kênh thoại thành công!', '✅');
    } catch (err) {
        showToast('Không thể kết nối vào kênh voice: ' + err.message, '❌');
    } finally {
        btnModalConnect.textContent = 'Tham gia';
    }
});

// --- Socket.IO Realtime Listeners ---
socket.on('player_update', (data) => {
    if (data.guildId === currentGuildId) {
        updatePlayerUI(data);
    }
});

socket.on('tick', (data) => {
    if (data.guildId === currentGuildId && !isSeeking) {
        currentSeconds = data.currentSeconds;
        currentDuration = data.durationSeconds;
        seekCurrent.textContent = data.currentFormatted;
        seekTotal.textContent = formatDuration(currentDuration);

        const pct = Math.min(100, Math.max(0, data.progressPercent));
        seekProgress.style.width = `${pct}%`;
        seekThumb.style.left = `${pct}%`;

        const mobileMiniFill = document.getElementById('mobile-mini-fill');
        if (mobileMiniFill) mobileMiniFill.style.width = `${pct}%`;

        // Sync lyrics karaoke scroll
        syncLyricsScroll(currentSeconds);
    }
});

// --- Update UI with Player State ---
function updatePlayerUI(player) {
    currentPlayerData = player;
    const track = player.currentTrack;

    // Multi-Bot Active Rooms Hub
    const roomsSwitcherBar = document.getElementById('rooms-switcher-bar');
    const roomsChipsList = document.getElementById('rooms-chips-list');
    if (roomsSwitcherBar && roomsChipsList) {
        const activePlayers = player.activePlayers || [];
        if (activePlayers.length > 1) {
            roomsSwitcherBar.style.display = 'flex';
            roomsChipsList.innerHTML = activePlayers.map(p => {
                const isActive = (p.voiceChannelId === player.voiceChannelId);
                return `<div class="room-chip ${isActive ? 'active' : ''}" onclick="selectRoom('${p.voiceChannelId}')">
                    <span>🔊 ${p.voiceChannelName || 'Voice'}</span>
                    <span style="opacity:0.8;">(Bot #${p.bot?.index || 1})</span>
                </div>`;
            }).join('');
        } else {
            roomsSwitcherBar.style.display = 'none';
        }
    }

    // Voice Status
    if (player.voiceChannelName) {
        const botName = player.bot?.username ? ` • ${player.bot.username}` : '';
        voiceChannelName.textContent = player.voiceChannelName;
        voiceChannelSub.textContent = player.bot ? `Phục vụ bởi Bot #${player.bot.index || 1} (${player.bot.username})` : 'Bot sẵn sàng phát nhạc';
        barVoiceBadge.textContent = `🔊 ${player.voiceChannelName}${botName}`;
        theaterVoiceBadge.textContent = `🔊 ${player.voiceChannelName}${botName}`;
    } else {
        voiceChannelName.textContent = 'Chưa kết nối';
        voiceChannelSub.textContent = 'Bấm để tham gia';
        barVoiceBadge.textContent = '🔊 Kênh thoại';
        theaterVoiceBadge.textContent = '🔊 Chưa kết nối';
    }

    // Play / Pause Icon
    const isPlaying = track && !player.isPaused;
    const playIconSvg = isPlaying
        ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
        : '<path d="M8 5v14l11-7z"/>';

    ctrlPlayIcon.innerHTML = playIconSvg;
    heroPlayIcon.innerHTML = playIconSvg;
    theaterPlayIcon.innerHTML = playIconSvg;

    // Mini waveform in player bar
    const miniWaveform = document.getElementById('player-mini-waveform');
    if (miniWaveform) {
        if (isPlaying) miniWaveform.classList.add('playing');
        else miniWaveform.classList.remove('playing');
    }

    if (isPlaying) {
        heroVisualizer.style.display = 'flex';
        heroStatusLabel.textContent = 'ĐANG PHÁT TRỰC TIẾP';
        vinylDisc.classList.add('spinning');
    } else {
        heroVisualizer.style.display = 'none';
        heroStatusLabel.textContent = track ? 'ĐÃ TẠM DỪNG' : 'CHỜ PHÁT NHẠC';
        vinylDisc.classList.remove('spinning');
    }

    // Loop Mode
    btnCtrlLoop.classList.remove('active');
    if (player.loopMode === 'track') {
        btnCtrlLoop.classList.add('active');
        btnCtrlLoop.title = 'Đang lặp lại bài hát hiện tại';
    } else if (player.loopMode === 'queue') {
        btnCtrlLoop.classList.add('active');
        btnCtrlLoop.title = 'Đang lặp lại toàn bộ hàng đợi';
    } else {
        btnCtrlLoop.title = 'Chế độ lặp: Tắt';
    }

    // Volume
    if (!isAdjustingVolume) {
        const vol = player.volume !== undefined ? player.volume : 80;
        volProgress.style.width = `${Math.min(100, vol)}%`;
        volThumb.style.left = `${Math.min(100, vol)}%`;
        updateVolumeIcon(vol);
    }

    // Track Info
    if (track) {
        currentDuration = track.durationSeconds || 0;
        currentSeconds = player.currentSeconds || 0;

        heroArt.src = track.thumbnail;
        if (heroBgArt) heroBgArt.style.backgroundImage = `url('${track.thumbnail}')`;
        heroTitle.textContent = track.title;
        heroArtist.textContent = track.artist;
        heroMeta.textContent = `Yêu cầu bởi: ${track.requestedBy ? track.requestedBy.username : 'Dashboard'} • Thời lượng: ${track.durationFormatted}`;

        barThumb.src = track.thumbnail;
        barTitle.textContent = track.title;
        barArtist.textContent = track.artist;

        theaterArt.src = track.thumbnail;
        theaterBackdrop.style.backgroundImage = `url('${track.thumbnail}')`;
        theaterTitle.textContent = track.title;
        theaterArtist.textContent = track.artist;

        seekTotal.textContent = track.durationFormatted || formatDuration(currentDuration);
        seekCurrent.textContent = formatDuration(currentSeconds);

        const pct = currentDuration > 0 ? (currentSeconds / currentDuration) * 100 : 0;
        seekProgress.style.width = `${pct}%`;
        seekThumb.style.left = `${pct}%`;

        // Update Lyrics View
        updateLyricsView(track, player);
    } else {
        if (heroBgArt) heroBgArt.style.backgroundImage = 'none';
        heroTitle.textContent = 'Chưa có bài hát nào đang phát';
        heroArtist.textContent = 'Khám phá danh sách bài hát hot bên dưới hoặc gõ lệnh /play trên Discord để quẩy nhạc!';
        heroMeta.textContent = 'Sẵn sàng kết nối kênh thoại';

        barTitle.textContent = 'Chưa phát nhạc';
        barArtist.textContent = 'Craftopia Music Studio';

        theaterTitle.textContent = 'Chưa phát nhạc';
        theaterArtist.textContent = 'Craftopia Music';

        seekCurrent.textContent = '0:00';
        seekTotal.textContent = '0:00';
        seekProgress.style.width = '0%';
        seekThumb.style.left = '0%';

        // Reset Lyrics View
        updateLyricsView(null, player);
    }

    // Render Queues
    renderQueues(player.queue || []);
}

function renderQueues(queue) {
    if (sidebarQueueCount) sidebarQueueCount.textContent = queue.length;
    const mobileQueueCount = document.getElementById('mobile-queue-count');
    if (mobileQueueCount) mobileQueueCount.textContent = queue.length;
    if (queueStatsText) {
        const totalSecs = queue.reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
        queueStatsText.textContent = `${queue.length} bài hát trong hàng đợi • Tổng thời lượng: ${formatDuration(totalSecs)}`;
    }

    if (queue.length === 0) {
        homeQueueTbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding: 48px;">
                    <div class="empty-queue-art">
                        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
                        <p style="margin-top:10px; font-weight:700; color:var(--text-secondary);">Hàng đợi hiện đang trống</p>
                        <span style="font-size:12px; color:var(--text-muted);">Hãy chọn bài hát gợi ý phía trên hoặc gõ tên bài vào ô tìm kiếm để phát!</span>
                    </div>
                </td>
            </tr>
        `;
    } else {
        homeQueueTbody.innerHTML = queue.slice(0, 5).map((t, idx) => `
            <tr>
                <td style="color:var(--text-muted); font-weight:700;">${idx + 1}</td>
                <td>
                    <div class="track-row-title">
                        <img src="${t.thumbnail}" alt="Thumb">
                        <div>
                            <div class="track-meta-title">${t.title}</div>
                            <div class="track-meta-artist">${t.artist}</div>
                        </div>
                    </div>
                </td>
                <td style="color:var(--text-muted); font-family:'JetBrains Mono', monospace;">${t.durationFormatted}</td>
                <td style="color:var(--text-muted);">${t.requestedBy ? t.requestedBy.username : 'Web'}</td>
                <td style="text-align: right;">
                    <button class="btn-icon-action delete" onclick="removeQueueTrack(${idx})" title="Xoá bài">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    if (queue.length === 0) {
        fullQueueTbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; color:var(--text-muted); padding: 60px;">
                    Không có bài hát nào trong hàng đợi.
                </td>
            </tr>
        `;
    } else {
        fullQueueTbody.innerHTML = queue.map((t, idx) => `
            <tr>
                <td style="color:var(--text-muted); font-weight:700;">${idx + 1}</td>
                <td>
                    <div class="track-row-title">
                        <img src="${t.thumbnail}" alt="Thumb">
                        <div>
                            <div class="track-meta-title">${t.title}</div>
                            <div class="track-meta-artist">${t.artist}</div>
                        </div>
                    </div>
                </td>
                <td style="color:var(--text-muted); font-family:'JetBrains Mono', monospace;">${t.durationFormatted}</td>
                <td style="color:var(--text-muted);">${t.requestedBy ? t.requestedBy.username : 'Web'}</td>
                <td style="text-align: right;">
                    <button class="btn-icon-action delete" onclick="removeQueueTrack(${idx})" title="Xoá khỏi hàng đợi">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

// --- Player Controls Dispatcher ---
async function sendControl(action, value = null) {
    if (!currentGuildId) {
        showToast('Vui lòng chọn một Server Discord trước!', '⚠️');
        return;
    }
    try {
        await fetch(`${BACKEND_URL}/api/guilds/${currentGuildId}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, value })
        });
    } catch (err) {
        console.error('Lỗi gửi điều khiển:', err);
    }
}

function setupControls() {
    const togglePlay = () => sendControl('toggle');
    btnCtrlPlay.addEventListener('click', togglePlay);
    heroPlayBtn.addEventListener('click', togglePlay);
    theaterPlayBtn.addEventListener('click', togglePlay);

    const doNext = () => {
        sendControl('skip');
        showToast('Đã bỏ qua bài hát ⏭️', '⏭️');
    };
    btnCtrlNext.addEventListener('click', doNext);
    heroSkipBtn.addEventListener('click', doNext);
    theaterSkipBtn.addEventListener('click', doNext);

    btnCtrlPrev.addEventListener('click', () => {
        sendControl('previous');
        showToast('Phát lại từ đầu / Bài trước ⏮️', '⏮️');
    });
    btnCtrlShuffle.addEventListener('click', () => {
        sendControl('shuffle');
        showToast('Đã xáo trộn danh sách 🔀', '🔀');
    });
    queueShuffleBtn.addEventListener('click', () => {
        sendControl('shuffle');
        showToast('Đã xáo trộn danh sách 🔀', '🔀');
    });
    btnCtrlLoop.addEventListener('click', () => {
        sendControl('loop');
    });

    barHeartBtn.addEventListener('click', () => {
        barHeartBtn.classList.toggle('active');
        showToast('Đã thêm vào mục yêu thích! ❤️', '❤️');
    });

    queueClearBtn.addEventListener('click', () => {
        if (confirm('Bạn có chắc chắn muốn xoá toàn bộ bài hát trong hàng đợi?')) {
            sendControl('remove', -1);
            showToast('Đã xoá toàn bộ hàng đợi!', '🗑️');
        }
    });
}

window.removeQueueTrack = (index) => {
    sendControl('remove', index);
    showToast('Đã xoá bài hát khỏi hàng đợi!', '🗑️');
};

// --- Seekbar Logic with Tooltip ---
function setupSeekbar() {
    function calculateSeekPosition(e) {
        const rect = seekSlider.getBoundingClientRect();
        const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        return (clickX / rect.width);
    }

    seekSlider.addEventListener('mousemove', (e) => {
        const pct = calculateSeekPosition(e);
        const hoverSec = Math.floor(pct * currentDuration);
        seekTooltip.textContent = formatDuration(hoverSec);
        seekTooltip.style.left = `${pct * 100}%`;
    });

    seekSlider.addEventListener('mousedown', (e) => {
        isSeeking = true;
        const pct = calculateSeekPosition(e);
        seekProgress.style.width = `${pct * 100}%`;
        seekThumb.style.left = `${pct * 100}%`;
        const targetSec = Math.floor(pct * currentDuration);
        seekCurrent.textContent = formatDuration(targetSec);

        const onMouseMove = (moveEvent) => {
            if (!isSeeking) return;
            const movePct = calculateSeekPosition(moveEvent);
            seekProgress.style.width = `${movePct * 100}%`;
            seekThumb.style.left = `${movePct * 100}%`;
            seekCurrent.textContent = formatDuration(Math.floor(movePct * currentDuration));
        };

        const onMouseUp = (upEvent) => {
            isSeeking = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            const finalPct = calculateSeekPosition(upEvent);
            const finalSec = Math.floor(finalPct * currentDuration);
            sendControl('seek', finalSec);
            showToast(`Tua đến: ${formatDuration(finalSec)}`, '⏩');
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// --- Volume Logic ---
function setupVolume() {
    function calculateVolume(e) {
        const rect = volSlider.getBoundingClientRect();
        const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        return Math.round((clickX / rect.width) * 100);
    }

    volSlider.addEventListener('mousedown', (e) => {
        isAdjustingVolume = true;
        const vol = calculateVolume(e);
        applyVolume(vol);

        const onMouseMove = (moveEvent) => {
            if (!isAdjustingVolume) return;
            applyVolume(calculateVolume(moveEvent));
        };

        const onMouseUp = (upEvent) => {
            isAdjustingVolume = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            sendControl('volume', calculateVolume(upEvent));
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    btnVolumeIcon.addEventListener('click', () => {
        if (currentPlayerData && currentPlayerData.volume > 0) {
            lastVolume = currentPlayerData.volume;
            applyVolume(0);
            sendControl('volume', 0);
            showToast('Đã tắt tiếng', '🔇');
        } else {
            const restored = lastVolume || 80;
            applyVolume(restored);
            sendControl('volume', restored);
            showToast(`Âm lượng: ${restored}%`, '🔊');
        }
    });
}

function applyVolume(vol) {
    volProgress.style.width = `${vol}%`;
    volThumb.style.left = `${vol}%`;
    updateVolumeIcon(vol);
}

function updateVolumeIcon(vol) {
    if (vol === 0) {
        btnVolumeIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
    } else if (vol < 50) {
        btnVolumeIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';
    } else {
        btnVolumeIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
    }
}

// --- Theater Mode ---
function setupTheaterMode() {
    const openTheater = () => theaterModal.classList.add('active');
    const closeTheater = () => theaterModal.classList.remove('active');

    btnToggleTheater.addEventListener('click', openTheater);
    heroTheaterBtn.addEventListener('click', openTheater);
    btnCloseTheater.addEventListener('click', closeTheater);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && theaterModal.classList.contains('active')) {
            closeTheater();
        }
    });
}

// --- Keyboard Shortcuts ---
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        const shortcutsModal = document.getElementById('shortcuts-modal');

        if (e.code === 'Space') {
            e.preventDefault();
            sendControl('toggle');
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            sendControl('seek', currentSeconds + 5);
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            sendControl('seek', Math.max(0, currentSeconds - 5));
        } else if (e.code === 'ArrowUp') {
            e.preventDefault();
            const newVol = Math.min(150, (currentPlayerData?.volume || 80) + 5);
            applyVolume(newVol);
            sendControl('volume', newVol);
        } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            const newVol = Math.max(0, (currentPlayerData?.volume || 80) - 5);
            applyVolume(newVol);
            sendControl('volume', newVol);
        } else if (e.code === 'KeyM') {
            btnVolumeIcon.click();
        } else if (e.code === 'KeyF') {
            theaterModal.classList.toggle('active');
        } else if (e.code === 'KeyN') {
            btnCtrlNext.click();
        } else if (e.code === 'KeyP') {
            btnCtrlPrev.click();
        } else if (e.code === 'KeyL') {
            btnCtrlLoop.click();
        } else if (e.code === 'KeyS') {
            btnCtrlShuffle.click();
        } else if (e.key === '/') {
            e.preventDefault();
            switchTab('tab-search');
            topSearchInput.focus();
        } else if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
            e.preventDefault();
            if (shortcutsModal) shortcutsModal.classList.toggle('active');
        } else if (e.key === 'Escape') {
            if (shortcutsModal && shortcutsModal.classList.contains('active')) {
                shortcutsModal.classList.remove('active');
            }
            const sleepModal = document.getElementById('sleep-modal');
            if (sleepModal && sleepModal.classList.contains('active')) {
                sleepModal.classList.remove('active');
            }
            const eqModal = document.getElementById('eq-modal');
            if (eqModal && eqModal.classList.contains('active')) {
                eqModal.classList.remove('active');
            }
        }
    });
}

function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// --- Multi-Bot Room Selection ---
window.selectRoom = function(voiceChannelId) {
    if (!currentPlayerData || !currentPlayerData.activePlayers) return;
    const targetPlayer = currentPlayerData.activePlayers.find(p => p.voiceChannelId === voiceChannelId);
    if (targetPlayer) {
        targetPlayer.activePlayers = currentPlayerData.activePlayers;
        updatePlayerUI(targetPlayer);
        showToast(`Đã chuyển góc nhìn sang phòng: ${targetPlayer.voiceChannelName} (Bot #${targetPlayer.bot?.index || 1})`, '🔊');
    }
};

// --- Real Synchronized Lyrics & Karaoke Mode ---
let currentLyricsLines = [];
let lastTrackUrlForLyrics = '';
let isFetchingLyrics = false;
let currentLyricsIsSynced = true;

function setupLyricsView() {
    const btnBarLyrics = document.getElementById('btn-bar-lyrics');
    if (btnBarLyrics) {
        btnBarLyrics.addEventListener('click', () => {
            switchTab('tab-lyrics');
        });
    }

    const btnCopyLyrics = document.getElementById('btn-copy-lyrics');
    if (btnCopyLyrics) {
        btnCopyLyrics.addEventListener('click', () => {
            if (currentLyricsLines.length === 0) {
                showToast('Không có lời bài hát để sao chép!', '⚠️');
                return;
            }
            const text = currentLyricsLines.map(l => l.text).join('\n');
            navigator.clipboard.writeText(text).then(() => {
                showToast('Đã sao chép lời bài hát vào bộ nhớ tạm! 📋', '📋');
            }).catch(() => {
                showToast('Đã sao chép lời bài hát!', '📋');
            });
        });
    }

    const lyricsSearchInput = document.getElementById('lyrics-search-input');
    const btnLyricsSearch = document.getElementById('btn-lyrics-search');

    if (btnLyricsSearch && lyricsSearchInput) {
        const doManualSearch = () => {
            const query = lyricsSearchInput.value.trim();
            if (query) {
                fetchAndRenderLyrics(query, '', 0);
            }
        };

        btnLyricsSearch.addEventListener('click', doManualSearch);
        lyricsSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doManualSearch();
        });
    }
}

window.promptSearchLyrics = function() {
    const input = document.getElementById('lyrics-search-input');
    if (input) {
        input.focus();
        showToast('Nhập tên bài hát vào ô tìm kiếm bên trên rồi nhấn Enter!', '🔍');
    }
};

async function updateLyricsView(track, player) {
    const lyricsArt = document.getElementById('lyrics-art');
    const lyricsTitle = document.getElementById('lyrics-title');
    const lyricsArtist = document.getElementById('lyrics-artist');
    const lyricsLinesWrap = document.getElementById('lyrics-lines-wrap');
    const lyricsAmbientBg = document.getElementById('lyrics-ambient-bg');

    if (!lyricsLinesWrap) return;

    if (!track) {
        if (lyricsTitle) lyricsTitle.textContent = 'Chưa có bài hát đang phát';
        if (lyricsArtist) lyricsArtist.textContent = 'Phát bài hát để thưởng thức chế độ Karaoke Lyrics đồng bộ';
        lyricsLinesWrap.innerHTML = `
            <div class="lyrics-empty-state">
                <div class="lyrics-musical-note">🎵</div>
                <p>Chưa có bài hát nào đang phát</p>
                <span>Bấm phát bài hát bất kỳ để xem lời bài hát thật chạy theo thời gian thực</span>
            </div>
        `;
        currentLyricsLines = [];
        lastTrackUrlForLyrics = '';
        if (lyricsAmbientBg) lyricsAmbientBg.style.backgroundImage = 'none';
        return;
    }

    if (lyricsArt) lyricsArt.src = track.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop';
    if (lyricsAmbientBg) lyricsAmbientBg.style.backgroundImage = `url('${track.thumbnail}')`;
    if (lyricsTitle) lyricsTitle.textContent = track.title;
    if (lyricsArtist) lyricsArtist.textContent = track.artist;

    if (lastTrackUrlForLyrics === track.url) return;
    lastTrackUrlForLyrics = track.url;

    await fetchAndRenderLyrics(track.title, track.artist, track.durationSeconds || 0);
}

async function fetchAndRenderLyrics(title, artist = '', duration = 0) {
    const lyricsLinesWrap = document.getElementById('lyrics-lines-wrap');
    const lyricsModeBadge = document.getElementById('lyrics-mode-badge');
    if (!lyricsLinesWrap) return;

    lyricsLinesWrap.innerHTML = `
        <div class="lyrics-loading-state">
            <div class="lyrics-spinner"></div>
            <p>Đang tìm kiếm và đồng bộ lời bài hát thật...</p>
            <span>Tra cứu cơ sở dữ liệu quốc tế & Việt Nam</span>
        </div>
    `;

    try {
        const queryParams = new URLSearchParams({
            title: title,
            artist: artist || '',
            duration: duration || 0
        });

        const res = await fetch(`${BACKEND_URL}/api/lyrics?${queryParams.toString()}`);
        const data = await res.json();

        if (data && data.found && data.lines && data.lines.length > 0) {
            currentLyricsLines = data.lines;
            currentLyricsIsSynced = data.synced;

            if (lyricsModeBadge) {
                lyricsModeBadge.textContent = data.synced ? 'KARAOKE SYNCED' : 'FULL LYRICS';
            }

            lyricsLinesWrap.innerHTML = currentLyricsLines.map((line, idx) => `
                <div class="lyric-line" id="lyric-line-${idx}" data-time="${line.time}" onclick="sendControl('seek', ${Math.floor(line.time)})">
                    <span class="lyric-text">${escapeHtml(line.text)}</span>
                    <span class="lyric-time-badge">${formatDuration(Math.floor(line.time))}</span>
                </div>
            `).join('');

            // Immediately highlight current line
            syncLyricsScroll(currentSeconds);
        } else {
            currentLyricsLines = [];
            lyricsLinesWrap.innerHTML = `
                <div class="lyrics-empty-state">
                    <div class="lyrics-musical-note">🎶</div>
                    <p>Chưa có dữ liệu lời bài hát đồng bộ cho bài này</p>
                    <span style="display:block; margin: 8px 0 16px; color:var(--text-muted);">"${escapeHtml(title)}"</span>
                    <button class="btn-pill" onclick="promptSearchLyrics()">🔍 Tìm kiếm lời bài hát thủ công</button>
                </div>
            `;
        }
    } catch (err) {
        console.error('[Lyrics Error]:', err);
        lyricsLinesWrap.innerHTML = `
            <div class="lyrics-empty-state">
                <div class="lyrics-musical-note">⚠️</div>
                <p>Không thể kết nối đến máy chủ lời bài hát</p>
                <button class="btn-pill" style="margin-top:14px;" onclick="lastTrackUrlForLyrics=''; updateLyricsView(currentPlayerData?.currentTrack, currentPlayerData)">Thử lại</button>
            </div>
        `;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

function syncLyricsScroll(sec) {
    if (!currentLyricsLines || currentLyricsLines.length === 0) return;
    const viewport = document.getElementById('lyrics-viewport');
    let activeIdx = -1;

    for (let i = 0; i < currentLyricsLines.length; i++) {
        if (sec >= currentLyricsLines[i].time) {
            activeIdx = i;
        } else {
            break;
        }
    }

    currentLyricsLines.forEach((_, idx) => {
        const el = document.getElementById(`lyric-line-${idx}`);
        if (!el) return;
        if (idx === activeIdx) {
            if (!el.classList.contains('active')) {
                el.classList.add('active');
                el.classList.remove('past');
                if (viewport) {
                    const targetScroll = el.offsetTop - (viewport.clientHeight / 2) + (el.clientHeight / 2);
                    viewport.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
                }
            }
        } else if (idx < activeIdx) {
            el.classList.remove('active');
            el.classList.add('past');
        } else {
            el.classList.remove('active');
            el.classList.remove('past');
        }
    });
}

// --- Sleep Timer Logic ---
let sleepTimerId = null;
let sleepEndTime = 0;
let sleepCountdownInterval = null;

function setupSleepTimer() {
    const sleepModal = document.getElementById('sleep-modal');
    const btnOpenSleep = document.getElementById('btn-open-sleep');
    const btnSleepClose = document.getElementById('btn-sleep-close');
    const sleepDot = document.getElementById('sleep-dot');
    const sleepStatusBar = document.getElementById('sleep-status-bar');

    if (!sleepModal || !btnOpenSleep) return;

    btnOpenSleep.addEventListener('click', () => sleepModal.classList.add('active'));
    if (btnSleepClose) btnSleepClose.addEventListener('click', () => sleepModal.classList.remove('active'));

    document.querySelectorAll('.sleep-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const minStr = btn.getAttribute('data-minutes');
            document.querySelectorAll('.sleep-btn').forEach(b => b.classList.remove('active'));

            if (minStr === '0') {
                if (sleepTimerId) clearTimeout(sleepTimerId);
                if (sleepCountdownInterval) clearInterval(sleepCountdownInterval);
                sleepTimerId = null;
                sleepEndTime = 0;
                if (sleepDot) sleepDot.style.display = 'none';
                if (sleepStatusBar) sleepStatusBar.style.display = 'none';
                showToast('Đã huỷ hẹn giờ tắt nhạc!', '🌙');
                sleepModal.classList.remove('active');
                return;
            }

            btn.classList.add('active');

            if (minStr === 'end') {
                const remaining = Math.max(5, (currentDuration - currentSeconds));
                setSleepTimeout(remaining);
                showToast(`Sẽ tắt nhạc khi hết bài hát hiện tại (còn ~${formatDuration(remaining)})`, '🌙');
            } else {
                const mins = parseInt(minStr, 10);
                const seconds = mins * 60;
                setSleepTimeout(seconds);
                showToast(`Đã hẹn giờ tắt nhạc sau ${mins} phút! Chúc bạn ngủ ngon 😴`, '🌙');
            }

            sleepModal.classList.remove('active');
        });
    });

    function setSleepTimeout(seconds) {
        if (sleepTimerId) clearTimeout(sleepTimerId);
        if (sleepCountdownInterval) clearInterval(sleepCountdownInterval);

        sleepEndTime = Date.now() + (seconds * 1000);
        if (sleepDot) sleepDot.style.display = 'block';

        if (sleepStatusBar) {
            sleepStatusBar.style.display = 'block';
            updateSleepStatusText();
            sleepCountdownInterval = setInterval(updateSleepStatusText, 1000);
        }

        sleepTimerId = setTimeout(() => {
            sendControl('pause');
            showToast('Hẹn giờ tắt nhạc: Bot đã tạm dừng phát nhạc. Chúc bạn ngủ ngon! 🌙💤', '😴');
            if (sleepDot) sleepDot.style.display = 'none';
            if (sleepStatusBar) sleepStatusBar.style.display = 'none';
            if (sleepCountdownInterval) clearInterval(sleepCountdownInterval);
            sleepTimerId = null;
        }, seconds * 1000);
    }

    function updateSleepStatusText() {
        if (!sleepStatusBar) return;
        const remaining = Math.max(0, Math.floor((sleepEndTime - Date.now()) / 1000));
        if (remaining <= 0) {
            sleepStatusBar.style.display = 'none';
            return;
        }
        sleepStatusBar.textContent = `🌙 Hẹn giờ tắt nhạc: còn ${formatDuration(remaining)}`;
    }
}

// --- Studio Audio Equalizer ---
function setupEqualizer() {
    const eqModal = document.getElementById('eq-modal');
    const btnOpenEq = document.getElementById('btn-open-eq');
    const btnEqClose = document.getElementById('btn-eq-close');
    const btnEqDone = document.getElementById('btn-eq-done');

    if (!eqModal || !btnOpenEq) return;

    btnOpenEq.addEventListener('click', () => eqModal.classList.add('active'));
    if (btnEqClose) btnEqClose.addEventListener('click', () => eqModal.classList.remove('active'));
    if (btnEqDone) btnEqDone.addEventListener('click', () => {
        eqModal.classList.remove('active');
        showToast('Đã áp dụng cấu hình âm học Studio Equalizer! 🎛️', '🎛️');
    });

    const presetValues = {
        studio: [65, 78, 55, 70, 85],
        bass: [95, 90, 60, 65, 75],
        vocal: [45, 55, 88, 90, 80],
        chill: [75, 65, 50, 60, 70],
        club: [100, 95, 70, 85, 95]
    };

    document.querySelectorAll('.eq-preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.eq-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const preset = chip.getAttribute('data-preset') || 'studio';
            const heights = presetValues[preset] || presetValues.studio;

            for (let i = 1; i <= 5; i++) {
                const meter = document.getElementById(`eq-f${i}`);
                if (meter) meter.style.height = `${heights[i - 1]}%`;
            }
            showToast(`Cấu hình EQ: ${chip.textContent.trim()} 🎵`, '🎛️');
        });
    });
}

// --- Keyboard Shortcuts Modal ---
function setupShortcutsModal() {
    const shortcutsModal = document.getElementById('shortcuts-modal');
    const btnOpenShortcuts = document.getElementById('btn-open-shortcuts');
    const btnShortcutsClose = document.getElementById('btn-shortcuts-close');

    if (!shortcutsModal) return;

    if (btnOpenShortcuts) {
        btnOpenShortcuts.addEventListener('click', () => shortcutsModal.classList.add('active'));
    }
    if (btnShortcutsClose) {
        btnShortcutsClose.addEventListener('click', () => shortcutsModal.classList.remove('active'));
    }
}
