/**
 * PrimeChat — Chat Engine (Rewritten)
 * Fixes: broken polling loop, double API calls, state management
 */

'use strict';

// ── Polling state ──
let _pollTimeout = null;
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
        '<div class="msg-loading"><div class="spinner spinner--lg"></div></div>';

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

        renderMessages();
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
                    renderMessages(); // fallback
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

    try {
        const res = await api(`/chat/poll?conversation_id=${convId}&last_id=${lastId}`);
        if (!res?.success) return;

        const { ms: shorthandMsgs, ty, us, ls, lr } = res.data;
        const messages = (shorthandMsgs || []).map(_remapMessage);
        const typing = ty;
        const other_user_status = us;
        const other_last_seen = ls;
        const other_last_read = lr;

        if (messages.length > 0) {
            _lastMessageReceivedAt = Date.now();
        }

        // ── Update header status / typing ──
        _updateHeaderStatus({ typing, other_user_status, other_last_seen });
        _toggleTypingBubble(typing);

        // ── Update read-receipt ticks ──
        _updateReadTicks(other_last_read);

        // ── Append genuinely new messages ──
        if (messages && messages.length > 0) {
            const existingIds = new Set(window.appState.messages.map(m => m.id));
            const existingClientIds = new Set(window.appState.messages.filter(m => m.client_msg_id).map(m => m.client_msg_id));

            const newMsgs = messages.filter(m => {
                if (existingIds.has(m.id)) return false;
                if (m.client_msg_id && existingClientIds.has(m.client_msg_id)) return false;
                return true;
            });

            if (newMsgs.length > 0) {
                const wasAtBottom = _isAtBottom();

                window.appState.messages.push(...newMsgs);
                window.appState.lastMessageId = _lastId(window.appState.messages);

                // Append new DOM nodes instead of full re-render
                _appendMessages(newMsgs);

                if (wasAtBottom) {
                    scrollToBottom(true);
                    _markLastRead();
                } else {
                    _showScrollBadge(newMsgs.length);
                }

                // Notification sound for incoming messages
                if (!newMsgs[newMsgs.length - 1].is_mine) {
                    _playSound();
                }
            }
        }
    } catch (e) {
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
    _appendMessages([tempMsg]);
    scrollToBottom(true);

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

            // Replace temp message with server-confirmed message
            const confirmedMsg = _remapMessage(res.data.message);
            _replaceTempMessage(tempId, confirmedMsg);
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

    _lastActivity = Date.now(); // Track activity

    if (window.appState.isTyping === isTyping) return;

    // Debounce typing notifications to the server
    clearTimeout(_typingDebounceTimer);
    _typingDebounceTimer = setTimeout(() => {
        window.appState.isTyping = isTyping;
        api('/chat/typing', {
            method: 'POST',
            body: { conversation_id: convId, is_typing: isTyping }
        }).catch(() => { });
    }, isTyping ? 500 : 0);

    if (isTyping) {
        clearTimeout(_typingTimer);
        _typingTimer = setTimeout(() => notifyTyping(false), 4000);
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
    c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    document.getElementById('scrollBottomBtn')?.classList.remove('show');
    const badge = document.getElementById('scrollBottomBadge');
    if (badge) { badge.classList.add('hidden'); badge.textContent = '0'; }
}

function _isAtBottom() {
    const c = document.getElementById('messagesContainer');
    if (!c) return true;
    return c.scrollHeight - c.scrollTop - c.clientHeight < 60;
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

function _updateReadTicks(otherLastRead) {
    window.appState.messages.forEach(msg => {
        if (!msg.is_mine || typeof msg.id !== 'number') return;
        const newStatus = msg.id <= otherLastRead ? 'read' : 'delivered';
        if (msg.read_status !== newStatus) {
            msg.read_status = newStatus;
            const el = document.getElementById(`msg_${msg.id}`);
            if (el) {
                const tick = el.querySelector('.message-ticks');
                if (tick) {
                    tick.className = `message-ticks ${newStatus}`;
                    tick.innerHTML = _tickSVG(newStatus);
                }
            }
        }
    });
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
            if (_isAtBottom()) scrollToBottom(true);
        }
    } else {
        if (bubble) bubble.remove();
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
    container?.addEventListener('scroll', () => {
        _lastActivity = Date.now(); // Track activity
        
        // Trigger lazy load when near top
        if (container.scrollTop < 100 && !_isLoadingOlder && _hasMoreHistory) {
            _loadOlderMessages();
        }

        if (_isAtBottom()) {
            document.getElementById('scrollBottomBtn')?.classList.remove('show');
            _markLastRead();
        }
    });
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
