/**
 * PrimeChat — Main App State & Initialization
 */

// Global State
window.appState = {
    user: null,
    activeConversationId: null,
    activeOtherUser: null,
    conversations: [],
    messages: [],
    lastMessageId: null,
    isTyping: false,
    typingTimeout: null,
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
    const _initTheme = async () => {
        await _loadModule('/js/theme.js');
        if (window.initTheme) window.initTheme();
    };
    // Apply saved theme immediately without JS (CSS data-theme handles it)
    // Only load full theme.js when user wants to change it
    document.getElementById('themeToggleBtn')?.addEventListener('click', async () => {
        await _initTheme();
        document.getElementById('themeToggleBtn')?.click(); // re-fire to actual handler
    }, { once: true });
    document.getElementById('profileThemeToggle')?.addEventListener('click', async () => {
        await _initTheme();
    }, { once: true });

    // ── LAZY MODULE: Emoji picker ──
    document.getElementById('emojiBtn')?.addEventListener('click', async () => {
        await _loadModule('/js/emoji.js');
        if (window.initEmoji) window.initEmoji();
        document.getElementById('emojiBtn')?.click(); // re-fire so the picker opens
    }, { once: true });

    // ── LAZY MODULE: Upload (file attach + drag-drop) ──
    document.getElementById('attachBtn')?.addEventListener('click', async () => {
        await _loadModule('/js/upload.js');
        if (window.initUpload) window.initUpload();
        document.getElementById('attachBtn')?.click(); // re-fire
    }, { once: true });
    // Also lazy-load on drag-over the entire app
    document.querySelector('.chat-app')?.addEventListener('dragover', async () => {
        await _loadModule('/js/upload.js');
        if (window.initUpload) window.initUpload();
    }, { once: true, passive: true });

    // ── LAZY MODULE: Voice recording ──
    document.getElementById('voiceBtn')?.addEventListener('click', async () => {
        await _loadModule('/js/voice.js');
        if (window.initVoice) window.initVoice();
        document.getElementById('voiceBtn')?.click(); // re-fire
    }, { once: true });

    // ── LAZY MODULE: Profile panel ──
    document.getElementById('sidebarProfileTrigger')?.addEventListener('click', async () => {
        await _loadModule('/js/profile.js');
        if (window.initProfile) window.initProfile();
        document.getElementById('sidebarProfileTrigger')?.click(); // re-fire
    }, { once: true });

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
