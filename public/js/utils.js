/**
 * PrimeChat — Utilities
 * Common helpers, API requests, formatting
 */

// ─────────────────────────────────────────
// GLOBAL EVENT BUS — single communication channel
// All modules emit/subscribe through this instead of
// reaching into each other's internals.
// ─────────────────────────────────────────
const EventBus = (() => {
    const _listeners = {};

    function on(event, callback) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push(callback);
        return () => off(event, callback); // returns unsubscribe fn
    }

    function off(event, callback) {
        if (!_listeners[event]) return;
        _listeners[event] = _listeners[event].filter(cb => cb !== callback);
    }

    function emit(event, data) {
        if (!_listeners[event]) return;
        for (const cb of _listeners[event]) {
            try { cb(data); } catch (e) { console.error(`[EventBus] Error in ${event}:`, e); }
        }
    }

    return { on, off, emit };
})();

// Expose globally
window.EventBus = EventBus;

const API_BASE = '/api';

/**
 * Make an API request
 */
async function api(endpoint, options = {}, retryCount = 0) {
    const url = `${API_BASE}${endpoint}`;
    const MAX_RETRIES = 3;
    
    const headers = {
        'Accept': 'application/json',
        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '',
        ...options.headers
    };

    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body === 'object') {
        body = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    }

    const _apiStart = performance.now();
    try {
        const response = await fetch(url, {
            ...options,
            credentials: 'include',
            headers,
            body
        });

        const _apiMs = performance.now() - _apiStart;
        PrimeLog.api(endpoint, _apiMs, response.ok);

        if (response.status === 401 && !['/login', '/', '/signup'].includes(window.location.pathname)) {
            window.location.href = '/login';
            return null;
        }

        const data = await response.json();
        
        if (!response.ok) {
            // Retry on server errors (5xx) or rate limits (429)
            if ((response.status >= 500 || response.status === 429) && retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000;
                await new Promise(r => setTimeout(r, delay));
                return api(endpoint, options, retryCount + 1);
            }
            const err = new Error(data.error || 'Something went wrong');
            if (data.errors) err.errors = data.errors;
            throw err;
        }
        
        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw error; // Quietly bubble up, don't retry or log
        }
        if (retryCount < MAX_RETRIES && (error.name === 'TypeError' || error.message.includes('NetworkError'))) {
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise(r => setTimeout(r, delay));
            return api(endpoint, options, retryCount + 1);
        }
        console.error(`[PrimeChat] API Error (${endpoint}):`, error);
        throw error;
    }
}

/**
 * Format timestamp to readable time/date
 */
function formatTime(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    
    const isToday = date.getDate() === now.getDate() && 
                    date.getMonth() === now.getMonth() && 
                    date.getFullYear() === now.getFullYear();
                    
    if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    
    if (date.getDate() === yesterday.getDate() && 
        date.getMonth() === yesterday.getMonth() && 
        date.getFullYear() === yesterday.getFullYear()) {
        return 'Yesterday';
    }
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Format bytes to readable size
 */
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Debounce function for search
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    
    // Add icon based on type
    let icon = '';
    if (type === 'success') {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
        icon = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `${icon} <span>${message}</span>`;
    
    container.appendChild(toast);

    // Remove after 3s
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Generate Avatar Initials
 */
function getInitials(name) {
    if (!name) return '?';
    return name.substring(0, 2).toUpperCase();
}

/**
 * Create Avatar HTML
 */
function createAvatar(user, sizeClass = 'avatar--md') {
    if (user.avatar_url) {
        return `<div class="avatar ${sizeClass}"><img src="/${user.avatar_url}" alt="${user.display_name}"></div>`;
    }
    
    // Hash name to get a consistent color (optional enhancement)
    return `<div class="avatar ${sizeClass}">${getInitials(user.display_name || user.username)}</div>`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

/**
 * On-demand module loader — injects a <script> tag once per src.
 * Returns a Promise that resolves when the script is ready.
 * Heavy modules (emoji, voice, upload, profile, theme) use this
 * so they don't block the initial page parse.
 *
 * Usage: await _loadModule('/js/emoji.js')
 */
const _moduleCache = {};
function _loadModule(src) {
    if (_moduleCache[src]) return _moduleCache[src];
    _moduleCache[src] = new Promise((resolve, reject) => {
        // Already in DOM (e.g. during HMR / dev)
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve(); return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.defer = true;
        s.onload  = () => resolve();
        s.onerror = () => { delete _moduleCache[src]; reject(new Error(`Failed to load ${src}`)); };
        document.head.appendChild(s);
    });
    return _moduleCache[src];
}

// ─────────────────────────────────────────
// DEBUG LOGGER
// Enable via: localStorage.setItem('debug', 'true')
// ─────────────────────────────────────────
const PrimeLog = (() => {
    const _enabled = () => localStorage.getItem('debug') === 'true';

    function event(name, data) {
        if (!_enabled()) return;
        console.log(`%c[Event] ${name}`, 'color: #6366f1; font-weight: bold', data || '');
    }

    function state(key, value) {
        if (!_enabled()) return;
        console.log(`%c[State] ${key}`, 'color: #22c55e; font-weight: bold', value);
    }

    function api(endpoint, ms, ok) {
        if (!_enabled()) return;
        const color = ok ? '#22c55e' : '#ef4444';
        console.log(`%c[API] ${endpoint} (${ms}ms)`, `color: ${color}; font-weight: bold`);
    }

    function perf(label, ms) {
        if (!_enabled()) return;
        console.log(`%c[Perf] ${label}: ${ms.toFixed(1)}ms`, 'color: #f59e0b; font-weight: bold');
    }

    return { event, state, api, perf };
})();

window.PrimeLog = PrimeLog;

// Auto-log all EventBus events when debug is enabled
const _origEmit = EventBus.emit.bind(EventBus);
EventBus.emit = (event, data) => {
    PrimeLog.event(event, data);
    _origEmit(event, data);
};
