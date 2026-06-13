/**
 * PrimeChat — Service Worker v3.0
 *
 * Responsibilities:
 *   1. Cache static assets for offline shell loading
 *   2. Background Sync — flush offline message queue when connectivity restores
 *   3. Background Sync — fire scheduled messages on time
 *   4. Push Notifications — receive server-pushed notifications
 *   5. Notification click — navigate to correct conversation
 *
 * Engineering notes:
 *   - Uses cache-first for assets, network-only for /api/ (fresh data always)
 *   - Background sync tag 'offline-queue' fires after connectivity restore
 *   - Background sync tag 'scheduled-check' fires periodically via periodicSync
 *   - Clients are messaged via postMessage for actual flush logic (keeps
 *     IndexedDB/fetch logic in the page context, SW just signals)
 */

'use strict';

const SW_VERSION  = 'primechat-v3.2';
const CACHE_NAME  = SW_VERSION;

// Static assets to cache on install — offline shell
const PRECACHE_URLS = [
    '/css/app.css',
    '/js/utils.js',
    '/js/app.js',
    '/js/sidebar.js',
    '/js/messages.js',
    '/js/notifications.js',
    '/js/chat.js',
    '/js/offline.js',
    '/js/search.js',
    '/js/analytics.js',
    '/js/scheduler.js',
    '/js/history.js',
];

// ─────────────────────────────────────────
// INSTALL — cache shell assets
// ─────────────────────────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Install', SW_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS).catch(e => {
                // Don't fail install if individual assets are missing
                console.warn('[SW] Precache partial failure:', e.message);
            }))
            .then(() => self.skipWaiting())
    );
});

// ─────────────────────────────────────────
// ACTIVATE — remove stale caches
// ─────────────────────────────────────────
self.addEventListener('activate', event => {
    console.log('[SW] Activate', SW_VERSION);
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)
                    .map(k => { console.log('[SW] Deleting stale cache:', k); return caches.delete(k); })
            ))
            .then(() => self.clients.claim())
    );
});

// ─────────────────────────────────────────
// FETCH — network-first for API, cache-first for assets
// ─────────────────────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Never cache: non-GET, API calls, external URLs, auth pages
    if (request.method !== 'GET') return;
    if (url.pathname.startsWith('/api/')) return;
    if (url.origin !== self.location.origin) return;
    if (['/login', '/signup', '/onboarding'].some(p => url.pathname.startsWith(p))) return;

    event.respondWith(
        caches.match(request).then(cached => {
            const networkFetch = fetch(request).then(response => {
                if (response.ok && response.type !== 'opaque') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(() => cached || new Response('Offline', { status: 503 }));

            // Cache-first: return cached immediately, update in background
            return cached || networkFetch;
        })
    );
});

// ─────────────────────────────────────────
// BACKGROUND SYNC — flush offline queue
// ─────────────────────────────────────────
self.addEventListener('sync', event => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'offline-queue') {
        event.waitUntil(_notifyClients({ type: 'FLUSH_OFFLINE_QUEUE' }));
    }

    if (event.tag === 'scheduled-check') {
        event.waitUntil(_notifyClients({ type: 'CHECK_SCHEDULED_MESSAGES' }));
    }
});

// ─────────────────────────────────────────
// PERIODIC BACKGROUND SYNC — scheduled messages
// (Chrome 80+ with site engagement score)
// ─────────────────────────────────────────
self.addEventListener('periodicsync', event => {
    if (event.tag === 'scheduled-messages') {
        event.waitUntil(_notifyClients({ type: 'CHECK_SCHEDULED_MESSAGES' }));
    }
});

// ─────────────────────────────────────────
// PUSH NOTIFICATIONS
// ─────────────────────────────────────────
self.addEventListener('push', event => {
    if (!event.data) return;

    let data = {};
    try { data = event.data.json(); } catch (_) { data = { body: event.data.text() }; }

    const options = {
        body:    data.body || 'New message',
        icon:    data.icon || '/icons/icon-192.png',
        badge:   data.badge || '/icons/badge-72.png',
        tag:     data.tag || `conv-${data.convId}`,
        renotify: true,
        silent:  false,
        vibrate: [200, 100, 200],
        data: {
            url:    data.url || '/',
            convId: data.convId,
        },
        actions: [
            { action: 'open',      title: 'Open',         icon: '/icons/open-24.png' },
            { action: 'mark-read', title: 'Mark as read', icon: '/icons/check-24.png' },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'PrimeChat', options)
    );
});

// ─────────────────────────────────────────
// NOTIFICATION CLICK
// ─────────────────────────────────────────
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const { url, convId } = event.notification.data || {};

    if (event.action === 'mark-read') {
        // Notify client to mark as read without opening
        event.waitUntil(_notifyClients({ type: 'MARK_READ_BACKGROUND', convId }));
        return;
    }

    // Focus existing window or open new
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Prefer an already-open PrimeChat tab
                const existing = windowClients.find(c => c.url.includes(self.location.origin));
                if (existing) {
                    existing.focus();
                    if (convId) existing.postMessage({ type: 'NAVIGATE_TO_CONV', convId });
                    return;
                }
                return clients.openWindow(url || '/');
            })
    );
});

// ─────────────────────────────────────────
// MESSAGE FROM PAGE — handle page→SW requests
// ─────────────────────────────────────────
self.addEventListener('message', event => {
    const { type } = event.data || {};
    if (type === 'SKIP_WAITING') self.skipWaiting();
});

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
async function _notifyClients(message) {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
        client.postMessage(message);
    }
    // If no clients open, we can't flush — sync will retry
    return windowClients.length > 0;
}
