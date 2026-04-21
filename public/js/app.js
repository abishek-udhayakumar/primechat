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
    // Initialize UI components
    document.getElementById('currentUserName').textContent = window.appState.user.display_name;
    document.getElementById('currentUserAvatar').innerHTML = createAvatar(window.appState.user);
    
    // Initialize specific modules
    if (window.initSidebar) window.initSidebar();
    if (window.initChat) window.initChat();
    if (window.initMessages) window.initMessages();
    if (window.initProfile) window.initProfile();
    
    // Global Event Listeners
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        try {
            await api('/auth/logout', { method: 'POST' });
        } catch (e) {
            console.error(e);
        }
        localStorage.removeItem('user');
        localStorage.removeItem('csrf_token');
        window.location.href = '/login';
    });
}

function applyThemeAndWallpaper(user) {
    // Theme
    const theme = user.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    
    // Wallpaper
    const wallpaper = user.wallpaper || 'default';
    const messagesContainer = document.getElementById('messagesContainer');
    const chatEmpty = document.getElementById('chatEmpty');
    
    if (messagesContainer) {
        // Reset classes
        messagesContainer.className = 'messages-container';
        if (wallpaper.startsWith('solid') || wallpaper.startsWith('gradient')) {
            // Handled via inline style or CSS classes based on variables
            // For simplicity, we just add the class
        }
    }
}
