// Craftopia Music Dashboard Client
const socket = io();

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
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
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
        showToast(`Đang gửi yêu cầu phát: ${song.title}...`, '⏳');
        const res = await fetch(`/api/guilds/${currentGuildId}/play`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trackData: song,
                voiceChannelId: voiceChannelSelect?.value || null
            })
        });
        const data = await res.json();
        if (data.success && data.result) {
            switchTab('tab-home');
            showToast(`Đang phát: ${song.title}`, '▶️');
        } else {
            showToast(`Lỗi: ${data.error || 'Không thể phát bài'}`, '❌');
        }
    } catch (err) {
        showToast('Lỗi khi phát bài: ' + err.message, '❌');
    }
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

    await checkAuth();
    await loadGuilds();

    // Check URL guild query param
    const urlParams = new URLSearchParams(window.location.search);
    const queryGuild = urlParams.get('guild');
    if (queryGuild) {
        selectGuild(queryGuild);
    }
});

// --- Tab Navigation ---
function setupTabNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });

    heroSearchShortcut.addEventListener('click', () => {
        switchTab('tab-search');
        topSearchInput.focus();
    });
}

function switchTab(tabId) {
    navItems.forEach(item => {
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
}

// --- Auth Check ---
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data && data.user) {
            userName.textContent = data.user.username;
            if (data.user.avatar) userAvatar.src = data.user.avatar;
            if (!data.loggedIn) {
                userBadgeBtn.addEventListener('click', () => {
                    window.location.href = '/api/auth/login';
                });
            }
        }
    } catch (err) {
        console.error('Lỗi kiểm tra auth:', err);
    }
}

// --- Guilds Loading & Selection with Auto-Retry ---
async function loadGuilds() {
    try {
        const res = await fetch('/api/guilds');
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
        const res = await fetch(`/api/guilds/${guildId}`);
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
        await fetch(`/api/guilds/${currentGuildId}/join`, {
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
    }
});

// --- Update UI with Player State ---
function updatePlayerUI(player) {
    currentPlayerData = player;
    const track = player.currentTrack;

    // Voice Status
    if (player.voiceChannelName) {
        voiceChannelName.textContent = player.voiceChannelName;
        voiceChannelSub.textContent = 'Bot sẵn sàng phát nhạc';
        barVoiceBadge.textContent = `🔊 ${player.voiceChannelName}`;
        theaterVoiceBadge.textContent = `🔊 ${player.voiceChannelName}`;
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
    } else {
        heroTitle.textContent = 'Chưa có bài hát nào đang phát';
        heroArtist.textContent = 'Hãy tìm kiếm bài hát hoặc gõ /play trên Discord để bắt đầu';
        heroMeta.textContent = 'Sẵn sàng kết nối';

        barTitle.textContent = 'Chưa phát nhạc';
        barArtist.textContent = 'Craftopia Music Player';

        theaterTitle.textContent = 'Chưa phát nhạc';
        theaterArtist.textContent = 'Craftopia Music';

        seekCurrent.textContent = '0:00';
        seekTotal.textContent = '0:00';
        seekProgress.style.width = '0%';
        seekThumb.style.left = '0%';
    }

    // Render Queues
    renderQueues(player.queue || []);
}

function renderQueues(queue) {
    if (queue.length === 0) {
        homeQueueTbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; color:var(--text-muted); padding: 40px;">
                    Hàng đợi hiện đang trống. Hãy nhập tên bài hát vào thanh tìm kiếm phía trên để thêm bài!
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
        await fetch(`/api/guilds/${currentGuildId}/control`, {
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
        }
    });
}

function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}
