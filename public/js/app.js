/**
 * PrimeChat — Main App State & Initialization
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
    replyingTo: null
};

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
            // Now re-fire so the actual emoji handler runs
            document.getElementById('emojiBtn')?.click();
        }
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
            document.getElementById('attachBtn')?.click();
        }
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
            // Re-fire so the actual handler runs  
            document.getElementById('voiceBtn')?.click();
        }
    });

    // ── LAZY MODULE: Profile panel ──
    let _profileLoaded = false;
    document.getElementById('sidebarProfileTrigger')?.addEventListener('click', async (e) => {
        if (!_profileLoaded) {
            e.stopImmediatePropagation();
            await _loadModule('/js/profile.js');
            if (window.initProfile) window.initProfile();
            _profileLoaded = true;
            document.getElementById('sidebarProfileTrigger')?.click();
        }
    });

    // ── Image lazy loading via IntersectionObserver ──
    // Observes images in the messages container and sets src only when visible
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

        // Expose globally so messages.js can use it
        window._imgObserver = _imgObserver;
    }
}

function applyThemeAndWallpaper(user) {
    document.documentElement.setAttribute('data-theme', user.theme || 'dark');
    window.appState.wallpaper = user.wallpaper || 'default';
}
