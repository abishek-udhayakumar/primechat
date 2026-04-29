/**
 * PrimeChat — Chat Engine (Rewritten)
 * Fixes: broken polling loop, double API calls, state management
 */

'use strict';

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
const POLL_INTERVAL_FAST = 1000;
const POLL_INTERVAL_ACTIVE = 3000;
const POLL_INTERVAL_IDLE = 10000;
const IDLE_THRESHOLD = 30000; // 30s

// ── Initialize chat module ──
window.initChat = () => {
    _bindInputHandlers();
    _bindScrollHandlers();
    _bindPanelHandlers();
    _bindMessageSearchHandlers();
    document.getElementById('cancelReplyBtn')?.addEventListener('click', cancelReply);
};

// ─────────────────────────────────────────
// OPEN CONVERSATION
// ─────────────────────────────────────────
window.openConversation = async (conversationId, otherUser) => {
    // Stop previous poll
    _stopPolling();

    // Reset state
    Object.assign(window.appState, {
        activeConversationId: conversationId,
        activeOtherUser: otherUser,
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
    // Skeleton instead of spinner — layout looks populated immediately
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

    // Start real-time polling
    _startPolling();

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
    if (!convId) return;

    try {
        const res = await api(`/chat/messages?conversation_id=${convId}&limit=50`);
        if (!res?.success) return;

        window.appState.messages = (res.data.ms || []).map(_remapMessage);
        window.appState.lastMessageId = _lastId(window.appState.messages);
        _hasMoreHistory = res.data.hm;

        window.renderMessages(window.appState.messages);
        scrollToBottom(false);
        _markLastRead();
    } catch (e) {
        console.error('[PrimeChat] Initial load failed:', e);
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

        const { ms: shorthandMsgs, ty, us, ls, lr } = res.data;
        const messages = (shorthandMsgs || []).map(_remapMessage);
        const typing = ty;
        const other_user_status = us;
        const other_last_seen = ls;
        const other_last_read = lr;

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
        read_status: 'sent',
        created_at: new Date().toISOString(),
        reply: window.appState.replyingTo
            ? { content: window.appState.replyingTo.content, sender_name: 'You' }
            : null,
        attachment: null,
    };

    // Clear input immediately
    if (input) { input.value = ''; input.style.height = 'auto'; }
    document.getElementById('sendBtn')?.classList.add('hidden');
    document.getElementById('voiceBtn')?.classList.remove('hidden');
    notifyTyping(false);
    cancelReply();

    window.appState.messages.push(tempMsg);
    window._appendMessages([tempMsg]);
    scrollToBottom(true);
    EventBus.emit('message:send', { message: tempMsg });

    _isSending = true;

    try {
        const res = await api('/chat/send', { method: 'POST', body: reqBody });

        if (res?.success) {
            // Handle new conversation created
            if (!window.appState.activeConversationId && res.data.conversation_id) {
                window.appState.activeConversationId = res.data.conversation_id;
                _startPolling();
                loadConversations();
            }

            // Check if poll already replaced it in the background
            const stillTemp = window.appState.messages.find(m => m.id === tempId);
            if (stillTemp) {
                const confirmedMsg = _remapMessage(res.data.message);
                _replaceTempMessage(tempId, confirmedMsg);
            }
            window.appState.lastMessageId = _lastId(window.appState.messages);
            loadConversations();
        }
    } catch (e) {
        console.error('[PrimeChat] Send failed:', e);
        showToast('Failed to send message', 'error');
        // Remove temp message
        window.appState.messages = window.appState.messages.filter(m => m.id !== tempId);
        const el = document.getElementById(`msg_${tempId}`);
        el?.remove();
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
        // Auto-stop after 2s inactivity
        _typingTimer = setTimeout(() => notifyTyping(false), 2000);
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

    // Find last message NOT sent by me
    const last = [...msgs].reverse().find(m => !m.is_mine);
    if (!last) return;

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
}

// ─────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────

const DOM_MSG_LIMIT = 200;

function _pruneOldMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const wrappers = container.querySelectorAll('.message-wrapper');
    if (wrappers.length <= DOM_MSG_LIMIT) return;

    const excess = wrappers.length - DOM_MSG_LIMIT;

    // Prune oldest DOM nodes and state in one RAF
    requestAnimationFrame(() => {
        for (let i = 0; i < excess; i++) {
            wrappers[i].remove();
        }
    });

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
        // Update tick to delivered
        const tick = el.querySelector('.message-ticks');
        if (tick) {
            tick.className = 'message-ticks delivered';
            tick.innerHTML = _tickSVG('delivered');
        }
    }
}

function _updateReadTicks(otherLastRead, otherUserStatus, otherLastSeen) {
    // Only scan the most recent 50 messages — avoids O(n) DOM queries on long chats
    const msgs = window.appState.messages;
    const start = Math.max(0, msgs.length - 50);
    for (let i = msgs.length - 1; i >= start; i--) {
        const msg = msgs[i];
        if (!msg.is_mine || typeof msg.id !== 'number') continue;
        
        let newStatus = 'sent';
        if (otherLastRead !== null && msg.id <= otherLastRead) {
            newStatus = 'read';
        } else {
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

    if (nameEl) nameEl.textContent = user.display_name || user.username;
    if (avatarEl) avatarEl.innerHTML = createAvatar(user);
    if (statusEl) {
        statusEl.textContent = user.status === 'online' ? 'online' : 'last seen recently';
        statusEl.className = `chat-header-status${user.status === 'online' ? ' online' : ''}`;
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
    const diffMin = Math.floor((now - d) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
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

function _playSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch (_) { /* no audio context */ }
}

function _tickSVG(status) {
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
        if (e.key === 'Enter' && !e.shiftKey) {
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
        document.getElementById('userInfoPanel')?.classList.add('show');
    });
    document.getElementById('closeUserInfoBtn')?.addEventListener('click', () => {
        document.getElementById('userInfoPanel')?.classList.remove('show');
    });
    document.getElementById('backToSidebarBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.remove('hidden-mobile');
        // Reset active conversation so badges and notifications work correctly
        _stopPolling();
        window.appState.activeConversationId = null;
        if (typeof renderConversations === 'function') renderConversations();
    });
}

// Stop polling when leaving page
window.addEventListener('beforeunload', _stopPolling);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.appState.activeConversationId) {
        _poll(); // immediate catch-up when tab becomes visible
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

    if (!toggleBtn || !searchBar) return;

    toggleBtn.addEventListener('click', () => {
        if (searchBar.style.display === 'none') {
            searchBar.style.display = 'flex';
            searchInput.focus();
        } else {
            searchBar.style.display = 'none';
            searchResults.style.display = 'none';
            searchInput.value = '';
        }
    });

    closeBtn.addEventListener('click', () => {
        searchBar.style.display = 'none';
        searchResults.style.display = 'none';
        searchInput.value = '';
    });

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        
        if (!query) {
            searchResults.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            const convId = window.appState.activeConversationId;
            if (!convId) return;

            try {
                const res = await api(`/search/messages?conversation_id=${convId}&query=${encodeURIComponent(query)}`);
                if (res?.success && res.data.length > 0) {
                    _renderMessageSearchResults(res.data, query);
                } else {
                    searchResults.style.display = 'block';
                    searchResults.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--color-text-secondary); font-size: 13px;">No messages found</div>';
                }
            } catch (err) {
                console.error(err);
            }
        }, 300);
    });
}

function _renderMessageSearchResults(results, query) {
    const searchResults = document.getElementById('msgSearchResults');
    if (!searchResults) return;

    searchResults.style.display = 'block';
    
    // Escape query for regex safely
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');

    searchResults.innerHTML = results.map(msg => {
        const highlighted = escapeHTML(msg.content).replace(regex, '<mark>$1</mark>');
        const date = new Date(msg.created_at);
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        
        return `
            <div class="msg-search-result-item" data-id="${msg.id}">
                <div class="msg-search-result-header">
                    <span>${escapeHTML(msg.sender_name)}</span>
                    <span>${dateStr}</span>
                </div>
                <div class="msg-search-result-content">${highlighted}</div>
            </div>
        `;
    }).join('');

    // Clicking a result
    searchResults.querySelectorAll('.msg-search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            document.getElementById('msgSearchBar').style.display = 'none';
            searchResults.style.display = 'none';
            showToast('Result found! (Pagination scrolling coming soon)', 'info');
        });
    });
}
