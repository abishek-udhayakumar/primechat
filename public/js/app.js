/**
 * PrimeChat V3 — Main App State & Initialization
 * Advanced Engineering: Offline-first, smart search, analytics, scheduled messages
 */

// Global State — single source of truth
window.appState = {
    user: null,
    activeConversationId: null,
    activeOtherUser: null,
    conversations: [],
    messages: [],
    lastMessageId: null,
    isTyping: false,
    typingTimeout: null,
    typingUsers: new Set(),
    onlineUsers: new Set(),
    unreadCount: 0,
    theme: 'dark',
    wallpaper: 'default',
    replyingTo: null,
    // V3 extensions
    offlineQueue:     [],
    scheduledCount:   0,
    searchIndexBuilt: false,
    activityType:     'idle', // 'idle'|'typing'|'recording'|'uploading'
};

// ── Service Worker Registration ──
(async () => {
    if (!('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[SW] Registered:', reg.scope);

        // Handle SW updates — notify user to refresh
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showToast('App updated! Refresh for the latest version.', 'info');
                }
            });
        });

        if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    } catch (e) {
        console.warn('[SW] Registration failed:', e.message);
    }
})();

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const userStr = localStorage.getItem('user');
    
    if (!userStr && window.location.pathname === '/chat') {
        window.location.href = '/login';
        return;
    }
    
    if (userStr) {
        try {
            window.appState.user = JSON.parse(userStr);
            applyThemeAndWallpaper(window.appState.user);
            
            // Verify session is still valid
            if (window.location.pathname === '/chat') {
                const res = await api('/auth/profile', { method: 'GET' });
                if (res && res.success) {
                    window.appState.user = res.data.user;
                    localStorage.setItem('user', JSON.stringify(res.data.user));
                    initApp();
                }
            } else if (window.location.pathname === '/' || window.location.pathname === '/login' || window.location.pathname === '/signup') {
                window.location.href = '/chat';
            }
        } catch (e) {
            console.error('Failed to parse user data', e);
            localStorage.removeItem('user');
            if (window.location.pathname === '/chat') {
                window.location.href = '/login';
            }
        }
    }
});

function initApp() {
    // Initialize UI with user data
    document.getElementById('currentUserName').textContent = window.appState.user.display_name;
    document.getElementById('currentUserAvatar').innerHTML = createAvatar(window.appState.user);

    // Critical modules (already deferred in HTML)
    if (window.initSidebar)  window.initSidebar();
    if (window.initChat)     window.initChat();
    if (window.initMessages) window.initMessages();

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        try { await api('/auth/logout', { method: 'POST' }); } catch (_) {}
        localStorage.removeItem('user');
        localStorage.removeItem('csrf_token');
        window.location.href = '/login';
    });

    // ── LAZY MODULE: Theme — load on first toggle click ──
    document.getElementById('themeToggleBtn')?.addEventListener('click', async () => {
        if (!window.toggleTheme) {
            await _loadModule('/js/theme.js');
        }
        if (window.toggleTheme) {
            await window.toggleTheme();
        }
    });

    // ── LAZY MODULE: Emoji picker ──
    let _emojiLoaded = false;
    document.getElementById('emojiBtn')?.addEventListener('click', async (e) => {
        if (!_emojiLoaded) {
            e.stopImmediatePropagation();
            await _loadModule('/js/emoji.js');
            if (window.initEmoji) window.initEmoji();
            _emojiLoaded = true;
            // Let initEmoji handle its own open on first call
        }
        // If already loaded, emoji.js's own listener handles it
    });

    // ── LAZY MODULE: Upload (file attach + drag-drop) ──
    let _uploadLoaded = false;
    const _ensureUpload = async () => {
        if (_uploadLoaded) return;
        await _loadModule('/js/upload.js');
        if (window.initUpload) window.initUpload();
        _uploadLoaded = true;
    };
    document.getElementById('attachBtn')?.addEventListener('click', async (e) => {
        if (!_uploadLoaded) {
            e.stopImmediatePropagation();
            await _ensureUpload();
            // After init, trigger file input directly
            document.getElementById('fileInput')?.click();
        }
        // If already loaded, upload.js's own listener handles it
    });
    // Also lazy-load on drag-over the entire app
    document.querySelector('.chat-app')?.addEventListener('dragover', () => _ensureUpload(), { once: true, passive: true });

    // ── LAZY MODULE: Voice recording ──
    let _voiceLoaded = false;
    document.getElementById('voiceBtn')?.addEventListener('click', async (e) => {
        if (!_voiceLoaded) {
            e.stopImmediatePropagation();
            await _loadModule('/js/voice.js');
            if (window.initVoice) window.initVoice();
            _voiceLoaded = true;
            // Let initVoice handle its own start on first call
        }
        // If already loaded, voice.js's own listener handles it
    });

    // ── LAZY MODULE: Profile panel ──
    let _profileLoaded = false;
    document.getElementById('sidebarProfileTrigger')?.addEventListener('click', async (e) => {
        if (!_profileLoaded) {
            e.stopImmediatePropagation();
            await _loadModule('/js/profile.js');
            if (window.initProfile) window.initProfile();
            _profileLoaded = true;
            // After init, open directly rather than re-clicking
            if (window.openProfile) window.openProfile();
        }
        // If already loaded, profile.js's own listener handles it
    });

    // ── Image lazy loading via IntersectionObserver ──
    if ('IntersectionObserver' in window) {
        const _imgObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const img = entry.target;
                if (img.dataset.lazySrc) {
                    img.src = img.dataset.lazySrc;
                    img.removeAttribute('data-lazy-src');
                }
                _imgObserver.unobserve(img);
            });
        }, { rootMargin: '200px 0px', threshold: 0 });
        window._imgObserver = _imgObserver;
    }

    // ── V3: Offline Queue ── (load immediately — needed before first message)
    _loadModule('/js/offline.js').then(() => {
        if (window.OfflineQueue) window.OfflineQueue.init();
    });

    // ── V3: Smart Search ──
    _loadModule('/js/search.js').then(() => {
        if (window.SmartSearch) window.SmartSearch.init();
    });

    // ── V3: Edit History ── (lazy on first edit history view)
    let _historyLoaded = false;
    window._ensureHistory = async () => {
        if (_historyLoaded) return;
        await _loadModule('/js/history.js');
        _historyLoaded = true;
    };

    // ── V3: Analytics ──
    let _analyticsLoaded = false;
    document.getElementById('analyticsBtn')?.addEventListener('click', async () => {
        if (!_analyticsLoaded) {
            await _loadModule('/js/analytics.js');
            _analyticsLoaded = true;
        }
        if (window.Analytics) window.Analytics.show();
    });

    // ── V3: Scheduler ──
    let _schedulerLoaded = false;
    const _ensureScheduler = async () => {
        if (_schedulerLoaded) return;
        await _loadModule('/js/scheduler.js');
        if (window.Scheduler) { window.Scheduler.init(); }
        _schedulerLoaded = true;
    };

    document.getElementById('scheduleBtn')?.addEventListener('click', async () => {
        await _ensureScheduler();
        const content = document.getElementById('messageInput')?.value?.trim() || '';
        if (window.Scheduler) window.Scheduler.showComposer(content);
    });

    document.getElementById('scheduledListBtn')?.addEventListener('click', async () => {
        await _ensureScheduler();
        if (window.Scheduler) window.Scheduler.showList();
    });

    // ── V3: Session Management ── (opened from profile panel)
    window._loadSessionManager = async () => {
        // Sessions UI is handled by profile.js
        if (!window.openProfile) {
            await _loadModule('/js/profile.js');
            if (window.initProfile) window.initProfile();
        }
        if (window.openProfile) window.openProfile('sessions');
    };
}

function applyThemeAndWallpaper(user) {
    document.documentElement.setAttribute('data-theme', user.theme || 'dark');
    window.appState.wallpaper = user.wallpaper || 'default';
}
