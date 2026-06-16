/**
 * PrimeChat — Chat Engine (Rewritten)
 * Fixes: broken polling loop, double API calls, state management
 */

'use strict';

// ── WebSocket state ──
let _ws = null;
let _wsReconnectTimer = null;
let _wsConnected = false;
window._wsConnected = false; // Global alias for cross-module checks
let _wsReconnectAttempts = 0;

// ── WS ack tracking (for send reliability) ──
const _wsAckResolvers = new Map();
const _wsAckTimers = new Map();
const WS_ACK_TIMEOUT = 4000;
const WS_PORT = window.PrimeChatConfig?.wsPort || (location.protocol === 'https:' ? '443' : (location.port || '8080'));
const WS_RECONNECT_BASE = 1000;
const WS_RECONNECT_MAX = 30000;

// ── Polling state ──
let _pollTimeout = null;
let _pollAbortController = null;
let _typingTimer = null;
let _typingDebounceTimer = null;
let _isSending = false;
let _isLoadingOlder = false;
let _hasMoreHistory = true;
let _lastActivity = Date.now();
let _lastMessageReceivedAt = Date.now();

// ── Conversation generation counter (prevents stale fetches) ──
let _convGeneration = 0;
const POLL_INTERVAL_FAST = 1000;
const POLL_INTERVAL_ACTIVE = 3000;
const POLL_INTERVAL_IDLE = 10000;
const IDLE_THRESHOLD = 30000; // 30s

// ── Message Cache (stale-while-revalidate) ──
const _msgCache = {};

function _cacheMessages(convId) {
    if (!convId || !window.appState.messages.length) return;
    const msgs = window.appState.messages.filter(m => typeof m.id === 'number');
    if (msgs.length > 100) {
        _msgCache[convId] = msgs.slice(-100);
    } else {
        _msgCache[convId] = msgs;
    }
}

function _getCachedMessages(convId) {
    return _msgCache[convId] || null;
}

// ─────────────────────────────────────────
// WEBSOCKET CLIENT
// ─────────────────────────────────────────

function _getWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const sessionCookie = document.cookie.split('; ').find(r => r.startsWith('PRIMECHAT_SESSION='));
    const sessionId = sessionCookie ? sessionCookie.split('=')[1] : '';
    return `${proto}//${host}:${WS_PORT}?session_id=${encodeURIComponent(sessionId)}`;
}

function _connectWs() {
    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;

    try {
        _ws = new WebSocket(_getWsUrl());

        _ws.onopen = () => {
            _wsConnected = true;
            window._wsConnected = true;
            _wsReconnectAttempts = 0; // Reset on successful connection
            console.log('[PrimeChat WS] Connected');
            _stopPolling();

            // Subscribe to active conversation
            const convId = window.appState.activeConversationId;
            if (convId) {
                _wsSend({ type: 'subscribe', conversation_id: convId });
            }

            // Re-sync: reload conversations to get fresh unread counts
            if (typeof loadConversations === 'function') {
                loadConversations();
            }

            EventBus.emit('ws:connected');
        };

        _ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                _handleWsMessage(data);
            } catch (e) {
                console.error('[PrimeChat WS] Parse error:', e);
            }
        };

        _ws.onclose = () => {
            _wsConnected = false;
            window._wsConnected = false;
            console.log('[PrimeChat WS] Disconnected');
            EventBus.emit('ws:disconnected');

            // Fall back to polling
            if (window.appState.activeConversationId) {
                _startPolling();
            }

            // Exponential backoff with jitter
            _wsReconnectAttempts++;
            const delay = Math.min(
                WS_RECONNECT_BASE * Math.pow(1.5, _wsReconnectAttempts - 1) + Math.random() * 500,
                WS_RECONNECT_MAX
            );
            console.log(`[PrimeChat WS] Reconnecting in ${Math.round(delay)}ms (attempt ${_wsReconnectAttempts})`);
            _wsReconnectTimer = setTimeout(_connectWs, delay);
        };

        _ws.onerror = (e) => {
            console.error('[PrimeChat WS] Error:', e);
            _ws.close();
        };
    } catch (e) {
        console.error('[PrimeChat WS] Connection failed:', e);
        _wsConnected = false;
        window._wsConnected = false;
        if (window.appState.activeConversationId) {
            _startPolling();
        }
    }
}

function _wsSend(data) {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify(data));
        return true;
    }
    return false;
}

/**
 * Send via WebSocket and wait for a server ack (new_message with matching client_msg_id).
 * Falls back if WS is down or ack times out.
 */
function _wsSendWithAck(data, timeoutMs = WS_ACK_TIMEOUT) {
    return new Promise((resolve, reject) => {
        if (!_wsSend(data)) {
            reject(new Error('WS not connected'));
            return;
        }
        const cmId = data.client_msg_id;
        if (!cmId) {
            resolve(null);
            return;
        }
        _wsAckResolvers.set(cmId, resolve);
        const timer = setTimeout(() => {
            _wsAckResolvers.delete(cmId);
            _wsAckTimers.delete(cmId);
            reject(new Error('WS ack timeout'));
        }, timeoutMs);
        _wsAckTimers.set(cmId, timer);
    });
}

function _disconnectWs() {
    _wsConnected = false;
    window._wsConnected = false;
    clearTimeout(_wsReconnectTimer);
    if (_ws) {
        _ws.onclose = null; // prevent auto-reconnect
        _ws.close();
        _ws = null;
    }
}

function _handleWsMessage(data) {
    switch (data.type) {
        case 'connected':
            console.log('[PrimeChat WS] Authenticated as user', data.user_id);
            break;

        case 'subscribed':
            console.log('[PrimeChat WS] Subscribed to conversation', data.conversation_id);
            break;

        case 'new_message':
            _handleWsNewMessage(data);
            break;

        case 'delivery_receipt':
            _handleWsDeliveryReceipt(data);
            break;

        case 'typing':
            _handleWsTyping(data);
            break;

        case 'status':
            _handleWsStatus(data);
            break;

        case 'read_receipt':
            _handleWsReadReceipt(data);
            break;

        case 'pong':
            break;

        case 'conv_update':
            _handleWsConvUpdate(data);
            break;

        case 'reaction_updated':
            _handleWsReactionUpdated(data);
            break;

        case 'group_updated':
            _handleWsGroupUpdated(data);
            break;

        case 'pin_updated':
            if (typeof loadConversations === 'function') {
                loadConversations();
            }
            break;

        case 'error':
            console.error('[PrimeChat WS] Server error:', data.message);
            break;
    }
}

function _handleWsNewMessage(data) {
    const convId = data.conversation_id;
    const msg = data.message ? _remapMessage(data.message) : null;

    if (!msg) return;

    // Resolve pending WS ack if this is our own message
    if (msg.client_msg_id && _wsAckResolvers.has(msg.client_msg_id)) {
        const resolve = _wsAckResolvers.get(msg.client_msg_id);
        clearTimeout(_wsAckTimers.get(msg.client_msg_id));
        _wsAckResolvers.delete(msg.client_msg_id);
        _wsAckTimers.delete(msg.client_msg_id);
        resolve(msg);
        // Continue to process replacement below
    }

    // Only process if we're viewing this conversation
    if (window.appState.activeConversationId !== convId) return;

    _lastMessageReceivedAt = Date.now();

    const existingIds = new Set(window.appState.messages.map(m => m.id));
    if (existingIds.has(msg.id)) return;

    // Replace temp message if client_msg_id matches
    if (msg.client_msg_id) {
        const tempIdx = window.appState.messages.findIndex(m => m.id === msg.client_msg_id);
        if (tempIdx !== -1) {
            _replaceTempMessage(msg.client_msg_id, msg);
            return;
        }
    }

    // Append new message
    const wasAtBottom = _isAtBottom();
    window.appState.messages.push(msg);
    window.appState.lastMessageId = _lastId(window.appState.messages);

    window._appendMessages([msg]);
    _pruneOldMessages();

    // Send delivery acknowledgment for messages from others
    if (!msg.is_mine && typeof msg.id === 'number') {
        _wsSend({ type: 'delivery_ack', conversation_id: convId, last_received_id: msg.id });
    }

    if (wasAtBottom) {
        scrollToBottom(true);
        _markLastRead();
    } else {
        _showScrollBadge(1);
    }

    EventBus.emit('message:receive', { messages: [msg], convId });
    if (!msg.is_mine) _playSound();
    _cacheMessages(convId);
}

function _handleWsConvUpdate(data) {
    if (typeof loadConversations === 'function') {
        loadConversations();
    }
}

function _handleWsReactionUpdated(data) {
    const { conversation_id, message_id, reactions } = data;
    if (!conversation_id || !message_id) return;
    const msg = window.appState.messages.find(m => m.id === message_id);
    if (!msg) return;
    msg.reactions = reactions || null;
    if (typeof _updateReactionsRow === 'function') {
        _updateReactionsRow(message_id, msg.reactions);
    }
}

function _handleWsGroupUpdated(data) {
    const { conversation_id, action, user_id } = data;
    if (window.appState.activeConversationId === conversation_id) {
        if (action === 'removed' && user_id === window.appState.user?.id) {
            showToast('You were removed from this group', 'info');
            document.getElementById('messageInput')?.setAttribute('disabled', '');
        }
    }
    if (typeof loadConversations === 'function') {
        setTimeout(loadConversations, 500);
    }
}

function _handleWsTyping(data) {
    if (window.appState.activeConversationId !== data.conversation_id) return;

    if (data.is_typing) {
        window.appState.typingUsers.add(data.user_id);
    } else {
        window.appState.typingUsers.delete(data.user_id);
    }

    const isTyping = window.appState.typingUsers.size > 0;
    EventBus.emit(isTyping ? 'typing:start' : 'typing:stop', { convId: data.conversation_id });
    _toggleTypingBubble(isTyping);
}

function _handleWsStatus(data) {
    if (!window.appState.activeOtherUser) return;
    if (data.user_id !== window.appState.activeOtherUser.id) return;

    if (data.status === 'online') {
        window.appState.onlineUsers.add(data.user_id);
    } else {
        window.appState.onlineUsers.delete(data.user_id);
    }

    const lastSeen = data.last_seen || null;

    // Update the conversation's other_user status in appState
    const conv = (window.appState.conversations || []).find(c => c.conversation_id === window.appState.activeConversationId);
    if (conv && conv.other_user) {
        conv.other_user.status = data.status;
        if (lastSeen) conv.other_user.last_seen = lastSeen;
    }

    EventBus.emit('user:status', { status: data.status, lastSeen });
    _updateHeaderStatus({ typing: false, other_user_status: data.status, other_last_seen: lastSeen });

    // Update sidebar status dot in real-time
    const dot = document.querySelector(`.conversation-item[data-conv-id="${window.appState.activeConversationId}"] .status-dot`);
    if (dot) {
        dot.className = `status-dot${data.status === 'online' ? ' online' : ''}`;
    }
}

function _handleWsDeliveryReceipt(data) {
    if (window.appState.activeConversationId !== data.conversation_id) return;

    const lastDeliveredId = data.last_delivered_id;
    if (!lastDeliveredId) return;

    // Update message ticks for messages up to last_delivered_id
    const msgs = window.appState.messages;
    const start = Math.max(0, msgs.length - 50);
    for (let i = msgs.length - 1; i >= start; i--) {
        const msg = msgs[i];
        if (!msg.is_mine || typeof msg.id !== 'number') continue;
        if (msg.id <= lastDeliveredId && msg.read_status !== 'read') {
            msg.read_status = 'delivered';
            const el = document.getElementById(`msg_${msg.id}`);
            if (el) {
                const tick = el.querySelector('.message-ticks');
                if (tick) {
                    tick.className = 'message-ticks delivered';
                    tick.innerHTML = _tickSVG('delivered');
                }
            }
        }
    }
}

function _handleWsReadReceipt(data) {
    if (window.appState.activeConversationId !== data.conversation_id) return;

    EventBus.emit('message:read', { lastReadId: data.last_read_id });
    _updateReadTicks(data.last_read_id, 'online', null);
}

// ── Initialize chat module ──
window.initChat = () => {
    _bindInputHandlers();
    _bindScrollHandlers();
    _bindPanelHandlers();
    _bindMessageSearchHandlers();
    document.getElementById('cancelReplyBtn')?.addEventListener('click', cancelReply);
    // Attempt WebSocket connection
    _connectWs();
    _startPresenceEngine();

    // Listen for offline queue sends (REST fallback)
    EventBus.on('offline:sent', ({ clientMsgId, serverResponse }) => {
        if (!clientMsgId || !serverResponse?.message) return;
        const stillTemp = window.appState.messages.find(m => m.id === clientMsgId);
        if (stillTemp) {
            const confirmedMsg = _remapMessage(serverResponse.message);
            _replaceTempMessage(clientMsgId, confirmedMsg);
            window.appState.lastMessageId = _lastId(window.appState.messages);
        }
    });

    // Listen for offline queue failures — mark message as failed
    EventBus.on('offline:failed', ({ id }) => {
        const msg = window.appState.messages.find(m => m.id === id);
        if (msg) {
            msg.read_status = 'failed';
            const el = document.getElementById(`msg_${id}`);
            if (el) {
                const tick = el.querySelector('.message-ticks');
                if (tick) {
                    tick.className = 'message-ticks failed';
                    tick.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><line x1="10" y1="6" x2="6" y2="10"/><line x1="6" y1="6" x2="10" y2="10"/></svg>';
                }
                el.title = 'Failed to send';
            }
        }
    });
};

// ─────────────────────────────────────────
// OPEN CONVERSATION
// ─────────────────────────────────────────
window.openConversation = async (conversationId, otherUser) => {
    // Unsubscribe from previous conversation via WS
    if (_wsConnected && window.appState.activeConversationId) {
        _wsSend({ type: 'unsubscribe', conversation_id: window.appState.activeConversationId });
    }

    // Stop previous poll
    _stopPolling();

    // Increment generation to invalidate any in-flight fetches
    const gen = ++_convGeneration;

    // Detect group conversations
    const isGroup = otherUser && otherUser.isGroup === true;

    // Reset state
    Object.assign(window.appState, {
        activeConversationId: conversationId,
        activeOtherUser: isGroup ? null : otherUser,
        activeGroupInfo: isGroup ? otherUser : null,
        messages: [],
        lastMessageId: 0,
        replyingTo: null,
        isTyping: false,
        typingUsers: new Set(),
    });
    _isLoadingOlder = false;
    _hasMoreHistory = true;

    cancelReply();

    // Show chat view
    document.getElementById('chatEmpty').classList.add('hidden');
    document.getElementById('activeChatView').classList.remove('hidden');

    // Update header
    _updateHeader(otherUser);

    // Loading spinner
    document.getElementById('messagesContainer').innerHTML =
        `<div class="msg-skeleton">
            <div class="msg-skel-bubble msg-skel-bubble--recv" style="width:60%"></div>
            <div class="msg-skel-bubble msg-skel-bubble--sent" style="width:45%"></div>
            <div class="msg-skel-bubble msg-skel-bubble--recv" style="width:70%"></div>
            <div class="msg-skel-bubble msg-skel-bubble--sent" style="width:50%"></div>
            <div class="msg-skel-bubble msg-skel-bubble--recv" style="width:55%"></div>
         </div>`;

    // Highlight active conversation in sidebar
    renderConversations();

    // Mobile: hide sidebar
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('hidden-mobile');
    }

    // Load initial messages
    await _loadInitialMessages();

    // Start real-time connection
    if (_wsConnected) {
        _wsSend({ type: 'subscribe', conversation_id: conversationId });
    } else {
        _startPolling();
    }

    // Notify the notification engine this conversation is now active
    EventBus.emit('conversation:opened', window.appState.activeConversationId);
    window.dispatchEvent(new CustomEvent('appStateChanged', { detail: { type: 'activeConversation' } }));

    document.getElementById('messageInput')?.focus();
};

// ─────────────────────────────────────────
// INITIAL MESSAGE LOAD
// ─────────────────────────────────────────
async function _loadInitialMessages() {
    const convId = window.appState.activeConversationId;
    const gen = _convGeneration;
    if (!convId) return;

    // 1. Show cached messages instantly (stale-while-revalidate)
    const cached = _getCachedMessages(convId);
    if (cached && cached.length > 0) {
        window.appState.messages = [...cached];
        window.appState.lastMessageId = _lastId(cached);
        window.renderMessages(cached);
        scrollToBottom(false);
    }

    // 2. Fetch fresh from server
    try {
        const res = await api(`/chat/messages?conversation_id=${convId}&limit=50`);
        
        // Stale check: if conversation changed during fetch, abort
        if (gen !== _convGeneration) return;
        if (!res?.success) return;

        const freshMsgs = (res.data.ms || []).map(_remapMessage);
        window.appState.messages = freshMsgs;
        window.appState.lastMessageId = _lastId(freshMsgs);
        _hasMoreHistory = res.data.hm;

        // Only re-render if data differs from cache
        if (!cached || freshMsgs.length !== cached.length ||
            _lastId(freshMsgs) !== _lastId(cached)) {
            window.renderMessages(freshMsgs);
            scrollToBottom(false);
        }

        _cacheMessages(convId);
        _markLastRead();
    } catch (e) {
        if (gen !== _convGeneration) return; // Stale, ignore error
        console.error('[PrimeChat] Initial load failed:', e);
        // If cache was shown, user sees something useful
        if (!cached) {
            showToast('Failed to load messages', 'error');
        }
    }
}

async function _loadOlderMessages() {
    if (_isLoadingOlder || !_hasMoreHistory) return;

    const convId = window.appState.activeConversationId;
    const firstMsg = window.appState.messages[0];
    if (!convId || !firstMsg || typeof firstMsg.id !== 'number') return;

    _isLoadingOlder = true;
    const container = document.getElementById('messagesContainer');
    const oldScrollHeight = container.scrollHeight;

    try {
        const res = await api(`/chat/messages?conversation_id=${convId}&before_id=${firstMsg.id}&limit=50`);
        if (res?.success) {
            const oldMsgs = (res.data.ms || []).map(_remapMessage);
            _hasMoreHistory = res.data.hm;

            if (oldMsgs.length > 0) {
                window.appState.messages = [...oldMsgs, ...window.appState.messages];
                
                // Prepend to DOM
                if (typeof window._prependMessages === 'function') {
                    window._prependMessages(oldMsgs);
                } else {
                    window.renderMessages(window.appState.messages); // fallback
                }

                // Immediate scroll restoration
                const newScrollHeight = container.scrollHeight;
                container.scrollTop = newScrollHeight - oldScrollHeight;
                
                // Frame-perfect stability fix
                requestAnimationFrame(() => {
                    container.scrollTop = container.scrollHeight - oldScrollHeight;
                });
            }
        }
    } catch (e) {
        console.error('[PrimeChat] History load failed:', e);
    } finally {
        _isLoadingOlder = false;
    }
}

function _remapMessage(m) {
    if (!m || m._remapped) return m;
    const res = {
        id: m.i,
        conversation_id: m.ci,
        sender_id: m.si,
        sender_name: m.sn,
        sender_avatar: m.sa,
        content: m.c,
        type: m.t,
        is_mine: m.im,
        is_edited: m.ie,
        is_deleted_for_everyone: m.id,
        forwarded_from_id: m.ff,
        read_status: m.rs,
        created_at: m.ca,
        client_msg_id: m.cm,
        reactions: m.rt || null,
        thread_root_id: m.tr || null,
        thread_reply_count: m.tc || 0,
        expires_at: m.ex || null,
        _remapped: true
    };
    if (m.re) {
        res.reply = {
            id: m.re.i,
            content: m.re.c,
            sender_id: m.re.si,
            sender_name: m.re.sn,
            type: m.re.t
        };
    }
    if (m.at) {
        res.attachment = {
            id: m.at.i,
            file_name: m.at.n,
            file_path: m.at.p,
            file_type: m.at.t,
            file_size: m.at.s,
            width: m.at.w,
            height: m.at.h,
            duration: m.at.d
        };
    }
    return res;
}

// ─────────────────────────────────────────
// POLLING — single /api/chat/poll call
// ─────────────────────────────────────────
function _startPolling() {
    _stopPolling();
    _poll(); // immediate first call
}

function _stopPolling() {
    if (_pollTimeout) {
        clearTimeout(_pollTimeout);
        _pollTimeout = null;
    }
    if (_pollAbortController) {
        _pollAbortController.abort();
        _pollAbortController = null;
    }
}

function _getPollInterval() {
    if (document.hidden || !window.appState.activeConversationId) return POLL_INTERVAL_IDLE;

    const idleTime = Date.now() - _lastActivity;
    const timeSinceLastMsg = Date.now() - _lastMessageReceivedAt;

    // If a message just arrived, poll faster for 10s to catch replies
    if (timeSinceLastMsg < 10000) return POLL_INTERVAL_FAST;

    // If user is away/idle, slow down
    if (idleTime > IDLE_THRESHOLD) return POLL_INTERVAL_IDLE;
    
    return POLL_INTERVAL_ACTIVE;
}

async function _poll() {
    const convId = window.appState.activeConversationId;
    const lastId = window.appState.lastMessageId || 0;
    
    // STOP polling if no active chat or tab is background
    if (!convId || document.visibilityState === 'hidden') {
        _pollTimeout = setTimeout(_poll, POLL_INTERVAL_IDLE);
        return;
    }

    if (_pollAbortController) {
        _pollAbortController.abort();
    }
    _pollAbortController = new AbortController();

    try {
        const res = await api(`/chat/poll?conversation_id=${convId}&last_id=${lastId}`, {
            signal: _pollAbortController.signal
        });
        if (!res?.success) return;

        const { ms: shorthandMsgs, ty, us, ls, lr, uc } = res.data;
        const messages = (shorthandMsgs || []).map(_remapMessage);
        const typing = ty;
        const other_user_status = us;
        const other_last_seen = ls;
        const other_last_read = lr;
        const unreadCount = uc;

        // ── Update unread count in appState and sidebar ──
        if (unreadCount !== undefined) {
            const conv = (window.appState.conversations || []).find(c => c.conversation_id === convId);
            if (conv) {
                conv.unread_count = unreadCount;
                renderConversations();
            }
        }

        // ── Populate appState.onlineUsers ──
        if (window.appState.activeOtherUser) {
            const uid = window.appState.activeOtherUser.id;
            if (other_user_status === 'online') {
                window.appState.onlineUsers.add(uid);
            } else {
                window.appState.onlineUsers.delete(uid);
            }
        }

        // ── Populate appState.typingUsers ──
        if (window.appState.activeOtherUser) {
            const uid = window.appState.activeOtherUser.id;
            if (typing) {
                window.appState.typingUsers.add(uid);
            } else {
                window.appState.typingUsers.delete(uid);
            }
        }

        // ── Emit standardized events ──
        EventBus.emit('user:status', { status: other_user_status, lastSeen: other_last_seen });
        EventBus.emit(typing ? 'typing:start' : 'typing:stop', { convId });

        if (messages.length > 0) {
            _lastMessageReceivedAt = Date.now();
        }

        // ── Update header status / typing ──
        _updateHeaderStatus({ typing, other_user_status, other_last_seen });
        _toggleTypingBubble(typing);

        // ── Update read-receipt ticks ──
        _updateReadTicks(other_last_read, other_user_status, other_last_seen);
        if (other_last_read) {
            EventBus.emit('message:read', { lastReadId: other_last_read });
        }

        // ── Append genuinely new messages ──
        if (messages && messages.length > 0) {
            const existingIds = new Set(window.appState.messages.map(m => m.id));
            const tempMessagesByClientId = new Map();
            window.appState.messages.forEach(m => {
                if (typeof m.id === 'string' && m.id.startsWith('c_')) {
                    tempMessagesByClientId.set(m.id, m);
                }
            });

            const newMsgs = [];
            messages.forEach(m => {
                if (existingIds.has(m.id)) return;
                
                if (m.client_msg_id && tempMessagesByClientId.has(m.client_msg_id)) {
                    _replaceTempMessage(m.client_msg_id, m);
                } else {
                    newMsgs.push(m);
                }
            });

            if (newMsgs.length > 0) {
                const wasAtBottom = _isAtBottom();

                window.appState.messages.push(...newMsgs);
                window.appState.lastMessageId = _lastId(window.appState.messages);

                // Append new DOM nodes instead of full re-render
                window._appendMessages(newMsgs);

                // ── DOM pruning: cap at 200 messages ──
                _pruneOldMessages();

                // Send delivery acknowledgment for received messages
                const lastReceived = newMsgs.filter(m => !m.is_mine && typeof m.id === 'number');
                if (lastReceived.length > 0) {
                    const maxId = Math.max(...lastReceived.map(m => m.id));
                    if (_wsConnected) {
                        _wsSend({ type: 'delivery_ack', conversation_id: convId, last_received_id: maxId });
                    }
                }

                if (wasAtBottom) {
                    scrollToBottom(true);
                    _markLastRead();
                } else {
                    _showScrollBadge(newMsgs.length);
                }

                // Emit message:receive + notification sound
                EventBus.emit('message:receive', { messages: newMsgs, convId });
                if (!newMsgs[newMsgs.length - 1].is_mine) {
                    _playSound();
                }

                // Update cache
                _cacheMessages(convId);
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('[PrimeChat] Poll error:', e);
    } finally {
        // Schedule next poll adaptively
        if (window.appState.activeConversationId) {
            _pollTimeout = setTimeout(_poll, _getPollInterval());
        }
    }
}

// ─────────────────────────────────────────
// SEND MESSAGE
// ─────────────────────────────────────────
async function sendMessage(content = null, type = 'text') {
    if (_isSending) return;

    const input = document.getElementById('messageInput');
    const msgContent = content || input?.value?.trim();

    if (!msgContent && type === 'text') return;

    const convId = window.appState.activeConversationId;
    const other = window.appState.activeOtherUser;

    if (!convId && !other) return;

    // Generate unique client-side ID for deduplication
    const clientMsgId = 'c_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();

    const reqBody = { content: msgContent, type, client_msg_id: clientMsgId };
    if (convId) reqBody.conversation_id = convId;
    else if (other) reqBody.recipient_id = other.id;
    if (window.appState.replyingTo) reqBody.reply_to_id = window.appState.replyingTo.id;

    // ── Optimistic update ──
    const tempId = clientMsgId; // Use clientMsgId as tempId for consistency
    const tempMsg = {
        id: tempId,
        sender_id: window.appState.user.id,
        content: msgContent,
        type,
        is_mine: true,
        is_edited: false,
        read_status: 'sending',
        created_at: new Date().toISOString(),
        reply: window.appState.replyingTo
            ? { content: window.appState.replyingTo.content, sender_name: 'You' }
            : null,
        attachment: null,
    };

    // Clear input immediately
    if (input) { 
        input.value = ''; 
        input.style.height = 'auto'; 
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    cancelReply();

    window.appState.messages.push(tempMsg);
    window._appendMessages([tempMsg]);
    scrollToBottom(true);
    EventBus.emit('message:send', { message: tempMsg });

    _isSending = true;

    // Try WebSocket with ack timeout
    const wsPayload = {
        type: 'send',
        conversation_id: convId,
        content: msgContent,
        msg_type: type,
        reply_to_id: window.appState.replyingTo ? window.appState.replyingTo.id : null,
        client_msg_id: clientMsgId,
    };

    if (_wsConnected) {
        try {
            await _wsSendWithAck(wsPayload);
            // WS ack received — server confirmed the message
            _isSending = false;
            return;
        } catch (wsErr) {
            console.warn('[PrimeChat] WS send failed, falling back:', wsErr.message);
        }
    }

    // Offline queue fallback (also handles REST)
    _enqueueOfflineMessage(clientMsgId, convId, other, msgContent, type);
}

function _enqueueOfflineMessage(clientMsgId, convId, other, msgContent, type) {
    if (window.OfflineQueue) {
        window.OfflineQueue.enqueue({
            clientMsgId: clientMsgId,
            convId: convId,
            recipientId: other ? other.id : null,
            content: msgContent,
            type: type,
            replyToId: window.appState.replyingTo ? window.appState.replyingTo.id : null
        }).catch(e => {
            console.error('[PrimeChat] OfflineQueue enqueue failed:', e);
            _fallbackRestApiSend(clientMsgId, convId, other, msgContent, type);
        });
        _isSending = false;
    } else {
        _fallbackRestApiSend(clientMsgId, convId, other, msgContent, type);
    }
}

async function _fallbackRestApiSend(clientMsgId, convId, other, msgContent, type) {
    const reqBody = {
        content: msgContent,
        type: type,
        client_msg_id: clientMsgId,
    };
    if (convId) {
        reqBody.conversation_id = convId;
    } else if (other) {
        reqBody.recipient_id = other.id;
    }

    if (window.appState.replyingTo) {
        reqBody.reply_to_id = window.appState.replyingTo.id;
    }

    try {
        const res = await api('/chat/send', { method: 'POST', body: reqBody });

        if (res?.success) {
            if (!window.appState.activeConversationId && res.data.conversation_id) {
                window.appState.activeConversationId = res.data.conversation_id;
                _startPolling();
                loadConversations();
            }
            const stillTemp = window.appState.messages.find(m => m.id === clientMsgId);
            if (stillTemp) {
                const confirmedMsg = _remapMessage(res.data.message);
                _replaceTempMessage(clientMsgId, confirmedMsg);
            }
            window.appState.lastMessageId = _lastId(window.appState.messages);
            loadConversations();
        }
    } catch (e) {
        console.error('[PrimeChat] Send failed:', e);
        const stillTemp = window.appState.messages.find(m => m.id === clientMsgId);
        if (stillTemp) {
            stillTemp.read_status = 'failed';
            const el = document.getElementById(`msg_${clientMsgId}`);
            if (el) {
                const tick = el.querySelector('.message-ticks');
                if (tick) {
                    tick.className = 'message-ticks failed';
                    tick.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><line x1="10" y1="6" x2="6" y2="10"/><line x1="6" y1="6" x2="10" y2="10"/></svg>';
                }
                el.title = 'Failed to send';
            }
        }
        showToast('Failed to send message', 'error');
    } finally {
        _isSending = false;
    }
}

// ─────────────────────────────────────────
// TYPING INDICATOR
// ─────────────────────────────────────────
function notifyTyping(isTyping) {
    const convId = window.appState.activeConversationId;
    if (!convId) return;

    _lastActivity = Date.now();

    if (window.appState.isTyping === isTyping) return;

    // Debounce typing notifications: 300ms for start, immediate for stop
    clearTimeout(_typingDebounceTimer);
    _typingDebounceTimer = setTimeout(() => {
        window.appState.isTyping = isTyping;
        api('/chat/typing', {
            method: 'POST',
            body: { conversation_id: convId, is_typing: isTyping }
        }).catch(() => { });
    }, isTyping ? 300 : 0);

    if (isTyping) {
        clearTimeout(_typingTimer);
        // Auto-stop after 5s inactivity (WhatsApp uses ~5-7s)
        _typingTimer = setTimeout(() => notifyTyping(false), 5000);
    }
}

// ─────────────────────────────────────────
// MARK AS READ
// ─────────────────────────────────────────
function _markLastRead() {
    const msgs = window.appState.messages;
    if (!msgs.length) return;

    const convId = window.appState.activeConversationId;
    if (!convId) return;

    // Find last message NOT sent by me — must have a real server ID (not a temp string)
    const last = [...msgs].reverse().find(m => !m.is_mine && typeof m.id === 'number');
    if (!last || last.id <= 0) return;

    api('/chat/read', {
        method: 'POST',
        body: { conversation_id: convId, message_id: last.id }
    }).catch(() => { });
}

async function markAsRead(messageId) {
    const convId = window.appState.activeConversationId;
    if (!convId) return;
    try {
        await api('/chat/read', {
            method: 'POST',
            body: { conversation_id: convId, message_id: messageId }
        });
        loadConversations();
    } catch (e) { /* silent */ }
}

// ─────────────────────────────────────────
// SCROLL HELPERS
// ─────────────────────────────────────────
function scrollToBottom(smooth = false) {
    const c = document.getElementById('messagesContainer');
    if (!c) return;
    // RAF ensures layout is complete before scrolling — prevents jank
    requestAnimationFrame(() => {
        c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    });
    document.getElementById('scrollBottomBtn')?.classList.remove('show');
    const badge = document.getElementById('scrollBottomBadge');
    if (badge) { badge.classList.add('hidden'); badge.textContent = '0'; }
    // Clear auto-hide timer
    clearTimeout(window._scrollBadgeTimer);
}

function _isAtBottom() {
    const c = document.getElementById('messagesContainer');
    if (!c) return true;
    return c.scrollHeight - c.scrollTop - c.clientHeight < 80;
}

function _showScrollBadge(count) {
    const badge = document.getElementById('scrollBottomBadge');
    const btn = document.getElementById('scrollBottomBtn');
    if (!badge || !btn) return;
    badge.textContent = (parseInt(badge.textContent || '0') + count).toString();
    badge.classList.remove('hidden');
    btn.classList.add('show');

    // Auto-hide badge after 5 seconds of inactivity
    clearTimeout(window._scrollBadgeTimer);
    window._scrollBadgeTimer = setTimeout(() => {
        badge.classList.add('hidden');
        badge.textContent = '0';
    }, 5000);
}

// ─────────────────────────────────────────
// REPLY
// ─────────────────────────────────────────
window.replyToMessage = (messageId) => {
    const msg = window.appState.messages.find(m => m.id == messageId);
    if (!msg) return;

    window.appState.replyingTo = msg;

    const nameEl = document.getElementById('replyPreviewName');
    const textEl = document.getElementById('replyPreviewText');
    if (nameEl) nameEl.textContent = msg.is_mine ? 'You' : (window.appState.activeOtherUser?.display_name || '');

    let preview = msg.content || '';
    if (msg.type === 'image') preview = '📷 Photo';
    else if (msg.type === 'file') preview = '📎 File';
    else if (msg.type === 'voice') preview = '🎤 Voice message';
    if (textEl) textEl.textContent = preview;

    document.getElementById('replyPreview')?.classList.add('show');
    document.getElementById('messageInput')?.focus();
};

function cancelReply() {
    window.appState.replyingTo = null;
    document.getElementById('replyPreview')?.classList.remove('show');
    document.getElementById('messageInput')?.focus();
}

// ─────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────

const DOM_MSG_LIMIT = 200;

function _pruneOldMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const wrappers = container.querySelectorAll('.message');
    if (wrappers.length <= DOM_MSG_LIMIT) return;

    const excess = wrappers.length - DOM_MSG_LIMIT;

    // Remove oldest DOM nodes synchronously (no RAF) to keep DOM and state in sync
    for (let i = 0; i < excess; i++) {
        wrappers[i].remove();
    }

    // Trim state array
    if (window.appState.messages.length > DOM_MSG_LIMIT) {
        window.appState.messages = window.appState.messages.slice(-DOM_MSG_LIMIT);
    }

    _hasMoreHistory = true; // allow re-fetch when scrolling up
}

function _lastId(msgs) {
    if (!msgs.length) return 0;
    // Ignore temp IDs (strings)
    const numeric = msgs.filter(m => typeof m.id === 'number');
    return numeric.length ? numeric[numeric.length - 1].id : 0;
}

function _replaceTempMessage(tempId, serverMsg) {
    if (!serverMsg) return;
    serverMsg.is_mine = true; // Guarantee correct flag
    const idx = window.appState.messages.findIndex(m => m.id === tempId);
    if (idx !== -1) {
        window.appState.messages[idx] = serverMsg;
    }
    // Update DOM element
    const el = document.getElementById(`msg_${tempId}`);
    if (el) {
        el.id = `msg_${serverMsg.id}`;
        el.dataset.msgId = serverMsg.id;
        // Use the server message_status for the tick
        const status = serverMsg.read_status || 'sent';
        const tick = el.querySelector('.message-ticks');
        if (tick) {
            tick.className = `message-ticks ${status}`;
            tick.innerHTML = _tickSVG(status);
        }
    }
    // Reset sending flag when server confirms
    _isSending = false;
}

function _updateReadTicks(otherLastRead, otherUserStatus, otherLastSeen) {
    // Only scan the most recent 50 messages — avoids O(n) DOM queries on long chats
    const msgs = window.appState.messages;
    const start = Math.max(0, msgs.length - 50);
    for (let i = msgs.length - 1; i >= start; i--) {
        const msg = msgs[i];
        if (!msg.is_mine || typeof msg.id !== 'number') continue;
        
        // Use the message_status from server if available
        let newStatus = msg.read_status || 'sent';
        
        // Override with computed status only if DB status is stale
        if (otherLastRead !== null && msg.id <= otherLastRead) {
            newStatus = 'read';
        } else if (newStatus === 'sent') {
            if (otherUserStatus === 'online') {
                newStatus = 'delivered';
            } else if (otherLastSeen && msg.created_at) {
                if (new Date(otherLastSeen) >= new Date(msg.created_at)) {
                    newStatus = 'delivered';
                }
            }
        }
        
        if (msg.read_status === newStatus) continue;
        msg.read_status = newStatus;
        const el = document.getElementById(`msg_${msg.id}`);
        if (!el) continue;
        const tick = el.querySelector('.message-ticks');
        if (tick) {
            tick.className = `message-ticks ${newStatus}`;
            tick.innerHTML = _tickSVG(newStatus);
        }
    }
}

function _updateHeader(user) {
    const nameEl = document.getElementById('chatHeaderName');
    const avatarEl = document.getElementById('chatHeaderAvatar');
    const statusEl = document.getElementById('chatHeaderStatus');

    const isGroup = window.appState.activeGroupInfo?.isGroup;

    if (isGroup) {
        if (nameEl) nameEl.textContent = window.appState.activeGroupInfo?.name || 'Group';
        if (avatarEl) avatarEl.innerHTML = '<div class="avatar avatar--md avatar--group">G</div>';
        if (statusEl) {
            statusEl.textContent = '';
            statusEl.className = 'chat-header-status';
        }
    } else if (user) {
        if (nameEl) nameEl.textContent = user.display_name || user.username;
        if (avatarEl) avatarEl.innerHTML = createAvatar(user);
        if (statusEl) {
            if (user.status === 'online') {
                statusEl.textContent = 'online';
                statusEl.className = 'chat-header-status online';
            } else if (user.last_seen) {
                statusEl.textContent = _formatLastSeen(user.last_seen);
                statusEl.className = 'chat-header-status';
            } else {
                statusEl.textContent = 'offline';
                statusEl.className = 'chat-header-status';
            }
        }
    }
}

function _updateHeaderStatus({ typing, other_user_status, other_last_seen }) {
    const el = document.getElementById('chatHeaderStatus');
    if (!el) return;

    if (typing) {
        el.textContent = 'typing...';
        el.className = 'chat-header-status typing';
    } else if (other_user_status === 'online') {
        el.textContent = 'online';
        el.className = 'chat-header-status online';
    } else {
        el.textContent = other_last_seen ? `last seen ${_formatLastSeen(other_last_seen)}` : 'offline';
        el.className = 'chat-header-status';
    }
}

function _formatLastSeen(ts) {
    if (!ts) return 'a while ago';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24 && d.getDate() === now.getDate()) {
        return `today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    const diffDays = Math.floor(diffH / 24);
    if (diffDays === 1 || (diffDays < 2 && d.getDate() !== now.getDate())) {
        return `yesterday at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays < 7) {
        return `${d.toLocaleDateString([], { weekday: 'long' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function _toggleTypingBubble(isTyping) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    let bubble = document.getElementById('typingBubble');

    if (isTyping) {
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.id = 'typingBubble';
            bubble.className = 'typing-indicator-bubble';
            bubble.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
            container.appendChild(bubble);
            // Small delay to allow DOM insertion before transition
            requestAnimationFrame(() => bubble.classList.add('active'));
            if (_isAtBottom()) scrollToBottom(true);
        } else if (!bubble.classList.contains('active')) {
            bubble.classList.add('active');
        }
    } else {
        if (bubble && bubble.classList.contains('active')) {
            bubble.classList.remove('active');
            // Remove from DOM after fade out completes (e.g., 200ms)
            setTimeout(() => {
                if (bubble && !bubble.classList.contains('active')) {
                    bubble.remove();
                }
            }, 250);
        }
    }
}

let _audioCtx = null;
function _playSound() {
    try {
        if (!_audioCtx) {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Resume if suspended (autoplay policy)
        if (_audioCtx.state === 'suspended') {
            _audioCtx.resume();
        }
        const osc = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain); gain.connect(_audioCtx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.1, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(_audioCtx.currentTime + 0.3);
    } catch (_) { /* no audio context */ }
}

function _tickSVG(status) {
    if (status === 'sending') {
        return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6" stroke-dasharray="28" stroke-dashoffset="8" class="tick-spinner"/></svg>';
    }
    if (status === 'sent') {
        return '<svg viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 6 10 14 2"/></svg>';
    }
    // delivered or read — double tick
    return '<svg viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 6 10 14 2"/><polyline points="10 10 14 14 22 6"/></svg>';
}

// ─────────────────────────────────────────
// EVENT BINDING
// ─────────────────────────────────────────
function _bindInputHandlers() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    input?.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
        const hasText = this.value.trim().length > 0;
        sendBtn?.classList.toggle('hidden', !hasText);
        document.getElementById('voiceBtn')?.classList.toggle('hidden', hasText);
        notifyTyping(hasText);
    });

    input?.addEventListener('keydown', (e) => {
        const enterToSend = window.appState?.user?.preferences?.enter_send !== false;
        if (e.key === 'Enter' && !e.shiftKey && enterToSend) {
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn?.addEventListener('click', () => sendMessage());
}

function _bindScrollHandlers() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    let _scrollRaf = null;

    // Passive + debounced via RAF — zero jank on mobile
    container.addEventListener('scroll', () => {
        if (_scrollRaf) return;
        _scrollRaf = requestAnimationFrame(() => {
            _scrollRaf = null;
            _lastActivity = Date.now();

            if (container.scrollTop < 120 && !_isLoadingOlder && _hasMoreHistory) {
                _loadOlderMessages();
            }

            if (_isAtBottom()) {
                document.getElementById('scrollBottomBtn')?.classList.remove('show');
                _markLastRead();
            }
        });
    }, { passive: true });

    document.getElementById('scrollBottomBtn')?.addEventListener('click', () => scrollToBottom(true));
}

function _bindPanelHandlers() {
    // Contact info side panel
    document.getElementById('chatInfoBtn')?.addEventListener('click', () => {
        const user = window.appState.activeOtherUser;
        if (!user) return;
        document.getElementById('infoAvatar').innerHTML = createAvatar(user, 'avatar--xl');
        document.getElementById('infoName').textContent = user.display_name;
        document.getElementById('infoUsername').textContent = '@' + user.username;
        document.getElementById('infoAbout').textContent = user.about || 'Available';
        const panel = document.getElementById('userInfoPanel');
        if (panel) { panel.style.display = 'flex'; panel.classList.add('show'); }
    });
    document.getElementById('closeUserInfoBtn')?.addEventListener('click', () => {
        const panel = document.getElementById('userInfoPanel');
        if (panel) { panel.classList.remove('show'); setTimeout(() => { panel.style.display = 'none'; }, 300); }
    });
    document.getElementById('backToSidebarBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.remove('hidden-mobile');
        // Hide active chat, show empty state
        document.getElementById('activeChatView')?.classList.add('hidden');
        document.getElementById('chatEmpty')?.classList.remove('hidden');
        // Reset active conversation so badges and notifications work correctly
        _stopPolling();
        window.appState.activeConversationId = null;
        window.appState.activeOtherUser = null;
        if (typeof renderConversations === 'function') renderConversations();
    });
}

// ─────────────────────────────────────────
// PRESENCE ENGINE (HEARTBEAT)
// ─────────────────────────────────────────
let _presenceInterval = null;

function _startPresenceEngine() {
    _stopPresenceEngine();
    _sendHeartbeat();
    _presenceInterval = setInterval(_sendHeartbeat, 30000);
}

function _stopPresenceEngine() {
    if (_presenceInterval) {
        clearInterval(_presenceInterval);
        _presenceInterval = null;
    }
}

async function _sendHeartbeat() {
    if (_wsConnected) {
        _wsSend({ type: 'heartbeat' });
    } else {
        try {
            await api('/chat/heartbeat', { method: 'GET' });
        } catch (e) {}
    }
}

// Stop polling / WS when leaving page
window.addEventListener('beforeunload', () => {
    _stopPolling();
    _stopPresenceEngine();
    _disconnectWs();
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        _startPresenceEngine();
        if (window.appState.activeConversationId && !_wsConnected) {
            _poll(); // immediate catch-up when tab becomes visible
        }
    } else {
        _stopPresenceEngine();
    }
});

// ── EventBus: upload complete → trigger poll to fetch real message ──
EventBus.on('upload:complete', () => {
    if (window.appState.activeConversationId) {
        _poll();
    }
    if (typeof loadConversations === 'function') loadConversations();
});

// ─────────────────────────────────────────
// MOBILE KEYBOARD HANDLING (VisualViewport API)
// Prevents input bar from being hidden behind soft keyboard.
// Uses 100dvh where supported, falls back to VisualViewport.
// ─────────────────────────────────────────
(function _initKeyboardHandling() {
    const app = document.querySelector('.chat-app');
    if (!app) return;

    // Prefer 100dvh (Chrome 108+, Safari 15.4+) — handles keyboard natively
    const supportsDvh = CSS.supports('height', '100dvh');
    if (supportsDvh) {
        app.style.height = '100dvh';
        return; // browser handles everything
    }

    // Fallback: VisualViewport API for older browsers
    if (!window.visualViewport) return;

    let _vpRaf = null;
    const _onVpResize = () => {
        if (_vpRaf) return;
        _vpRaf = requestAnimationFrame(() => {
            _vpRaf = null;
            const vh = window.visualViewport.height;
            const ot = window.visualViewport.offsetTop;
            app.style.height  = vh + 'px';
            app.style.top     = ot + 'px';
            app.style.position = 'fixed';
            if (_isAtBottom()) scrollToBottom(false);
        });
    };

    window.visualViewport.addEventListener('resize', _onVpResize, { passive: true });
    window.visualViewport.addEventListener('scroll', _onVpResize, { passive: true });
})();

// ─────────────────────────────────────────
// MESSAGE SEARCH
// ─────────────────────────────────────────
function _bindMessageSearchHandlers() {
    const toggleBtn = document.getElementById('msgSearchToggleBtn');
    const closeBtn = document.getElementById('msgSearchCloseBtn');
    const searchBar = document.getElementById('msgSearchBar');
    const searchInput = document.getElementById('msgSearchInput');
    const searchResults = document.getElementById('msgSearchResults');
    let debounceTimer = null;
    let searchQuery = '';
    let searchOffset = 0;
    let searchHasMore = false;
    let isLoadingMore = false;
    let searchObserver = null;

    if (!toggleBtn || !searchBar) return;

    toggleBtn.addEventListener('click', () => {
        const isVisible = searchBar.dataset.open === 'true';
        if (!isVisible) {
            searchBar.style.display = 'flex';
            searchBar.dataset.open = 'true';
            searchInput.focus();
        } else {
            searchBar.style.display = 'none';
            searchBar.dataset.open = 'false';
            if (searchResults) searchResults.style.display = 'none';
            searchInput.value = '';
            searchQuery = '';
            searchOffset = 0;
            searchHasMore = false;
        }
    });

    function _resetSearch() {
        searchBar.style.display = 'none';
        searchResults.style.display = 'none';
        searchInput.value = '';
        searchQuery = '';
        searchOffset = 0;
        searchHasMore = false;
        if (searchObserver) {
            searchObserver.disconnect();
            searchObserver = null;
        }
    }

    closeBtn.addEventListener('click', _resetSearch);

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        searchQuery = e.target.value.trim();
        searchOffset = 0;
        searchHasMore = false;
        if (searchObserver) {
            searchObserver.disconnect();
            searchObserver = null;
        }
        
        if (!searchQuery) {
            searchResults.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            const convId = window.appState.activeConversationId;
            if (!convId) return;

            try {
                const res = await api(`/search/messages?conversation_id=${convId}&query=${encodeURIComponent(searchQuery)}&limit=20`);
                if (res?.success && res.data.items && res.data.items.length > 0) {
                    searchHasMore = res.data.has_more || false;
                    searchOffset = res.data.items.length;
                    _renderMessageSearchResults(res.data.items, searchQuery, false);
                    // Re-attach observer for infinite scroll
                    _attachSearchObserver();
                } else {
                    searchResults.style.display = 'block';
                    searchResults.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--color-text-secondary); font-size: 13px;">No messages found</div>';
                }
            } catch (err) {
                console.error(err);
            }
        }, 300);
    });

    function _attachSearchObserver() {
        if (searchObserver) {
            searchObserver.disconnect();
            searchObserver = null;
        }
        if (!('IntersectionObserver' in window)) return;
        searchObserver = new IntersectionObserver(async (entries) => {
            if (entries[0].isIntersecting && searchHasMore && !isLoadingMore && searchQuery) {
                isLoadingMore = true;
                const convId = window.appState.activeConversationId;
                if (!convId) return;
                try {
                    const res = await api(`/search/messages?conversation_id=${convId}&query=${encodeURIComponent(searchQuery)}&limit=20&offset=${searchOffset}`);
                    if (res?.success && res.data.items && res.data.items.length > 0) {
                        searchHasMore = res.data.has_more || false;
                        searchOffset += res.data.items.length;
                        _renderMessageSearchResults(res.data.items, searchQuery, true);
                    } else {
                        searchHasMore = false;
                    }
                } catch (err) {
                    console.error(err);
                }
                isLoadingMore = false;
            }
        }, { root: searchResults, threshold: 0.1 });
    }
}

function _renderMessageSearchResults(results, query, append = false) {
    const searchResults = document.getElementById('msgSearchResults');
    if (!searchResults) return;

    searchResults.style.display = 'block';
    
    // Escape query for regex safely
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');

    if (!append) {
        searchResults.innerHTML = '';
    }

    const frag = document.createDocumentFragment();

    results.forEach(msg => {
        const highlighted = escapeHTML(msg.content || '').replace(regex, '<mark>$1</mark>');
        const date = new Date(msg.created_at);
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        
        const item = document.createElement('div');
        item.className = 'msg-search-result-item';
        item.dataset.id = msg.id;
        item.innerHTML = `
            <div class="msg-search-result-header">
                <span>${escapeHTML(msg.sender_name)}</span>
                <span>${dateStr}</span>
            </div>
            <div class="msg-search-result-content">${highlighted}</div>
        `;
        item.addEventListener('click', () => {
            document.getElementById('msgSearchBar').style.display = 'none';
            searchResults.style.display = 'none';
            scrollToMessage(msg.id);
        });
        frag.appendChild(item);
    });

    searchResults.appendChild(frag);

    // Scroll to top on fresh results
    if (!append) {
        searchResults.scrollTop = 0;
    }
}

// NOTE: Duplicate _renderMessageSearchResults removed.
// The version at line ~1434 (with append/infinite-scroll support) is the canonical one.
