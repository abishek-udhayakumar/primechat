/**
 * PrimeChat — Offline-First Message Queue
 *
 * Engineering showcase:
 *   - IndexedDB for persistent cross-tab client storage
 *   - BroadcastChannel for tab leader election (only ONE tab flushes)
 *   - client_msg_id for server-side idempotency (backend already supports this)
 *   - Exponential backoff: 1s → 2s → 4s → abandon (log to analytics)
 *   - Conflict detection: server ACK vs. optimistic local state
 *   - Connectivity events: online, visibilitychange, focus
 *
 * Interview points:
 *   - Why IndexedDB? localStorage is synchronous, 5MB limit, no structured data
 *   - Why BroadcastChannel? Service Worker could lose context; page-side is safer
 *   - Why client_msg_id? Idempotent sends — safe to retry without duplicates
 *   - Trade-off: Tab-leader approach means offline queue only flushes when a
 *     tab is open. True background sync requires Service Worker + Background Sync API.
 *
 * Queue entry schema:
 *   {
 *     id: string,          // = client_msg_id (UUID-like)
 *     convId: number|null, // null if new conversation
 *     recipientId: number|null,
 *     content: string,
 *     type: string,        // 'text'|'image'|'file'|'voice'
 *     replyToId: number|null,
 *     queuedAt: number,    // Date.now()
 *     status: string,      // 'pending'|'sending'|'failed'|'sent'
 *     retries: number,
 *     lastError: string|null,
 *   }
 */

'use strict';

// ── DB constants ──
const DB_NAME    = 'PrimeChatDB';
const DB_VERSION = 3;
const STORE_QUEUE = 'offline_queue';

// ── Leader election ──
let _isLeader       = false;
let _channel        = null;
let _flushTimer     = null;
let _leaderPingTimer= null;
let _dbInstance     = null;

// ─────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────

/**
 * Initialize the offline queue.
 * Call once on page load from app.js.
 */
window.OfflineQueue = {
    init,
    enqueue,
    getAll,
    remove,
    getStatus,
    flush: _flushQueue,
};

async function init() {
    try {
        _dbInstance = await _openDB();
        await _startLeaderElection();
        _bindConnectivityEvents();
        _listenToServiceWorker();

        // Check queue on startup
        await _flushQueue();
        console.log('[OfflineQ] Initialized. Leader:', _isLeader);
    } catch (e) {
        console.error('[OfflineQ] Init failed:', e);
    }
}

/**
 * Enqueue a message for offline sending.
 * Returns the client_msg_id (used for deduplication).
 */
async function enqueue(msg) {
    const id = msg.clientMsgId || _generateId();
    const entry = {
        id,
        convId:      msg.convId || null,
        recipientId: msg.recipientId || null,
        content:     msg.content,
        type:        msg.type || 'text',
        replyToId:   msg.replyToId || null,
        queuedAt:    Date.now(),
        status:      'pending',
        retries:     0,
        lastError:   null,
    };

    const db = await _getDB();
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).put(entry);
    await _txComplete(tx);

    // Try to flush immediately if we're leader and online
    if (_isLeader && navigator.onLine) {
        clearTimeout(_flushTimer);
        _flushTimer = setTimeout(_flushQueue, 100);
    }

    // Request Service Worker background sync as fallback
    _requestBgSync();

    EventBus.emit('offline:queued', { id, content: msg.content });
    _updateQueueBadge();

    return id;
}

/**
 * Get all pending entries in the queue.
 */
async function getAll() {
    const db = await _getDB();
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const store = tx.objectStore(STORE_QUEUE);
    return new Promise((res, rej) => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror   = () => rej(req.error);
    });
}

/**
 * Remove a specific entry by client_msg_id.
 */
async function remove(id) {
    const db = await _getDB();
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).delete(id);
    return _txComplete(tx);
}

/**
 * Get pending queue count for badge display.
 */
async function getStatus() {
    const entries = await getAll();
    return {
        pending: entries.filter(e => e.status === 'pending').length,
        failed:  entries.filter(e => e.status === 'failed').length,
        total:   entries.length,
    };
}

// ─────────────────────────────────────────
// FLUSH — send all pending messages
// ─────────────────────────────────────────
async function _flushQueue() {
    if (!navigator.onLine) return;
    if (!_isLeader) return; // Only leader flushes

    const entries = await getAll();
    const pending = entries.filter(e => e.status === 'pending' || e.status === 'failed');

    if (pending.length === 0) return;

    console.log(`[OfflineQ] Flushing ${pending.length} queued messages`);

    // Process sequentially to maintain message order per conversation
    for (const entry of pending) {
        await _sendEntry(entry);
        // Small gap between sends to avoid rate limiting
        await _sleep(150);
    }

    _updateQueueBadge();
    _broadcastQueueState();
}

async function _sendEntry(entry) {
    const MAX_RETRIES = 3;
    const db = await _getDB();

    // Mark as sending
    await _updateEntry(db, entry.id, { status: 'sending' });

    try {
        const body = {
            content:       entry.content,
            type:          entry.type,
            client_msg_id: entry.id,
        };
        if (entry.convId)      body.conversation_id = entry.convId;
        if (entry.recipientId) body.recipient_id    = entry.recipientId;
        if (entry.replyToId)   body.reply_to_id     = entry.replyToId;

        const res = await api('/chat/send', { method: 'POST', body });

        if (res?.success) {
            await _updateEntry(db, entry.id, { status: 'sent' });

            // Notify the chat module that queued message was sent
            EventBus.emit('offline:sent', {
                clientMsgId: entry.id,
                serverResponse: res.data,
            });

            // Remove from queue after 2s (give UI time to reflect)
            setTimeout(() => remove(entry.id), 2000);
        } else {
            throw new Error(res?.error || 'Send failed');
        }
    } catch (err) {
        const retries = (entry.retries || 0) + 1;

        if (retries >= MAX_RETRIES) {
            await _updateEntry(db, entry.id, {
                status:    'failed',
                retries,
                lastError: err.message,
            });
            EventBus.emit('offline:failed', { id: entry.id, error: err.message });
            showToast(`Message failed after ${MAX_RETRIES} retries. Tap to retry.`, 'error');
        } else {
            // Schedule retry with exponential backoff
            const delay = Math.pow(2, retries) * 1000;
            await _updateEntry(db, entry.id, {
                status:    'pending',
                retries,
                lastError: err.message,
            });
            setTimeout(_flushQueue, delay);
        }
    }
}

// ─────────────────────────────────────────
// LEADER ELECTION via BroadcastChannel
//
// Algorithm: "Bully lite" — tabs broadcast PING every 5s.
// If no reply in 1s, claim leadership.
// On receiving PING from another tab, yield leadership to whichever
// tab has been open longer (uses page's performance.timeOrigin).
// ─────────────────────────────────────────
async function _startLeaderElection() {
    if (!('BroadcastChannel' in window)) {
        // Fallback: always be leader (no multi-tab coordination)
        _isLeader = true;
        return;
    }

    _channel = new BroadcastChannel('primechat-queue-leader');

    _channel.onmessage = (evt) => {
        const { type, timeOrigin } = evt.data;

        if (type === 'PING') {
            // Another tab is announcing itself
            _channel.postMessage({ type: 'PONG', timeOrigin: performance.timeOrigin });

            // Whoever was opened FIRST gets to be leader (lower timeOrigin = older tab)
            if (_isLeader && performance.timeOrigin > timeOrigin) {
                // We're newer — yield leadership
                _isLeader = false;
                _stopLeaderPing();
                console.log('[OfflineQ] Yielded leadership to older tab');
            }
        }

        if (type === 'PONG') {
            if (_isLeader) return; // Already leader, ignore
            // Another tab responded — it's the leader
            _isLeader = false;
        }

        if (type === 'LEADER_GONE') {
            // Leader tab closed — claim leadership after random delay
            const delay = Math.random() * 500;
            setTimeout(_claimLeadership, delay);
        }

        if (type === 'QUEUE_STATE') {
            // Leader pushed updated queue state — update our badge
            _updateQueueBadge();
        }
    };

    // Announce ourselves and wait for response
    _channel.postMessage({ type: 'PING', timeOrigin: performance.timeOrigin });

    // If no PONG after 1.5s, claim leadership
    await _sleep(1500);
    _claimLeadership();
}

function _claimLeadership() {
    if (_isLeader) return;
    _isLeader = true;
    _startLeaderPing();
    console.log('[OfflineQ] Claimed leadership');
    // New leader flushes immediately
    _flushQueue();
}

function _startLeaderPing() {
    _stopLeaderPing();
    _leaderPingTimer = setInterval(() => {
        _channel?.postMessage({ type: 'PING', timeOrigin: performance.timeOrigin });
    }, 5000);
}

function _stopLeaderPing() {
    clearInterval(_leaderPingTimer);
    _leaderPingTimer = null;
}

// Notify other tabs when this tab unloads
window.addEventListener('beforeunload', () => {
    if (_isLeader) {
        _channel?.postMessage({ type: 'LEADER_GONE' });
    }
    _channel?.close();
});

// ─────────────────────────────────────────
// CONNECTIVITY EVENTS
// ─────────────────────────────────────────
function _bindConnectivityEvents() {
    window.addEventListener('online', () => {
        console.log('[OfflineQ] Online — flushing queue');
        showToast('Back online! Sending queued messages…', 'info');
        _flushQueue();
    });

    window.addEventListener('offline', () => {
        console.log('[OfflineQ] Offline — messages will be queued');
        _updateQueueBadge();
    });

    // Flush on tab visibility restore (user switches back to tab)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine && _isLeader) {
            _flushQueue();
        }
    });

    // Also flush on focus (for desktop users switching windows)
    window.addEventListener('focus', () => {
        if (navigator.onLine && _isLeader) _flushQueue();
    });
}

// ─────────────────────────────────────────
// SERVICE WORKER BRIDGE
// ─────────────────────────────────────────
function _listenToServiceWorker() {
    navigator.serviceWorker?.addEventListener('message', (evt) => {
        const { type } = evt.data || {};
        if (type === 'FLUSH_OFFLINE_QUEUE') {
            _claimLeadership();
            _flushQueue();
        }
        if (type === 'NAVIGATE_TO_CONV') {
            const { convId } = evt.data;
            EventBus.emit('nav:openConversation', { convId });
        }
        if (type === 'MARK_READ_BACKGROUND') {
            EventBus.emit('notification:markRead', { convId: evt.data.convId });
        }
    });
}

function _requestBgSync() {
    navigator.serviceWorker?.ready
        .then(reg => reg.sync?.register('offline-queue'))
        .catch(() => {}); // Fail silently — page-side flush is the primary mechanism
}

// ─────────────────────────────────────────
// UI: Offline status badge
// ─────────────────────────────────────────
function _updateQueueBadge() {
    getStatus().then(({ pending, failed }) => {
        const badge = document.getElementById('offlineQueueBadge');
        if (!badge) return;

        const total = pending + failed;
        if (total === 0) {
            badge.classList.add('hidden');
        } else {
            badge.textContent = total > 9 ? '9+' : String(total);
            badge.classList.remove('hidden');
            badge.classList.toggle('badge--error', failed > 0);
        }
    });
}

function _broadcastQueueState() {
    _channel?.postMessage({ type: 'QUEUE_STATE' });
}

// Show offline indicator in UI when applicable
EventBus.on('offline:queued', () => {
    if (!navigator.onLine) {
        const ind = document.getElementById('offlineIndicator');
        if (ind) ind.classList.add('show');
    }
});

EventBus.on('offline:sent', () => {
    getStatus().then(({ total }) => {
        if (total === 0) {
            const ind = document.getElementById('offlineIndicator');
            if (ind) ind.classList.remove('show');
        }
    });
});

// ─────────────────────────────────────────
// INDEXEDDB HELPERS
// ─────────────────────────────────────────
function _getDB() {
    if (_dbInstance) return Promise.resolve(_dbInstance);
    return _openDB().then(db => { _dbInstance = db; return db; });
}

function _openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;

            // Offline message queue
            if (!db.objectStoreNames.contains(STORE_QUEUE)) {
                const store = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
                store.createIndex('status',   'status',   { unique: false });
                store.createIndex('queuedAt', 'queuedAt', { unique: false });
            }

            // Scheduled messages
            if (!db.objectStoreNames.contains('scheduled_messages')) {
                const ss = db.createObjectStore('scheduled_messages', { keyPath: 'id' });
                ss.createIndex('scheduledAt', 'scheduledAt', { unique: false });
                ss.createIndex('status',      'status',      { unique: false });
            }

            // Edit history
            if (!db.objectStoreNames.contains('edit_history')) {
                const eh = db.createObjectStore('edit_history', { keyPath: 'id', autoIncrement: true });
                eh.createIndex('messageId', 'messageId', { unique: false });
            }

            // Notification settings
            if (!db.objectStoreNames.contains('notification_settings')) {
                db.createObjectStore('notification_settings', { keyPath: 'convId' });
            }

            // Upload chunks (for resumable uploads)
            if (!db.objectStoreNames.contains('upload_sessions')) {
                const us = db.createObjectStore('upload_sessions', { keyPath: 'uploadId' });
                us.createIndex('status', 'status', { unique: false });
            }
        };

        req.onsuccess = (e) => { _dbInstance = e.target.result; resolve(_dbInstance); };
        req.onerror   = ()  => reject(req.error);
    });
}

async function _updateEntry(db, id, updates) {
    const tx    = db.transaction(STORE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_QUEUE);
    const entry = await new Promise((res, rej) => {
        const r = store.get(id);
        r.onsuccess = () => res(r.result);
        r.onerror   = () => rej(r.error);
    });
    if (entry) store.put({ ...entry, ...updates });
    return _txComplete(tx);
}

function _txComplete(tx) {
    return new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror    = () => rej(tx.error);
        tx.onabort    = () => rej(new Error('Transaction aborted'));
    });
}

function _generateId() {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    return 'c_' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// Expose DB opener for other modules (search, scheduler, history)
window.PrimeChatDB = { open: _openDB, getDB: _getDB, txComplete: _txComplete };
