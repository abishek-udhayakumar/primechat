/**
 * PrimeChat — Notification Engine (v3)
 *
 * SINGLE source of truth for sidebar data + notifications.
 * Polls /chat/conversations every 5s, diffs against previous state,
 * and fires the appropriate notification layer:
 *
 *   1. Sidebar badge   — unread count per conversation
 *   2. In-app toast    — tab visible, user in different chat
 *   3. Browser popup   — tab hidden (OS-level)
 *   4. Document title  — "(3) PrimeChat"
 *   5. Sound           — for any new message not in active chat
 */

'use strict';

const Notifier = (() => {

    // ── State ──
    const _prevUnread = {};   // { convId: lastKnownUnreadCount }
    let   _pollTimeout = null;
    let   _permission = 'default';
    let   _started    = false;

    // ── Helpers ──

    /** Is the user actively viewing this specific conversation? */
    function _isViewing(convId) {
        if (document.visibilityState !== 'visible') return false;
        const chatView = document.getElementById('activeChatView');
        if (!chatView || chatView.classList.contains('hidden')) return false;
        return window.appState.activeConversationId === convId;
    }

    /** Format message preview like WhatsApp */
    function _preview(conv) {
        const type = conv.last_message?.type;
        if (type === 'image') return '📷 Photo';
        if (type === 'voice') return '🎤 Voice message';
        if (type === 'file')  return '📎 File';
        return conv.last_message?.content || 'New message';
    }

    /** Play the notification beep (reuse chat.js function if available) */
    function _beep() {
        if (typeof _playSound === 'function') {
            _playSound();
            return;
        }
        // Fallback: generate a short tone
        try {
            const ctx  = new (window.AudioContext || window.webkitAudioContext)();
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        } catch (_) {}
    }

    // ── Notification Layers ──

    /** Browser Notification API (OS-level, only when tab hidden) */
    function _browserNotify(sender, body) {
        if (_permission !== 'granted') return;
        if (document.visibilityState === 'visible') return;
        try {
            const n = new Notification(sender, {
                body,
                icon: '/favicon.ico',
                tag: 'primechat-' + sender, // collapse multiple from same sender
            });
            n.onclick = () => { window.focus(); n.close(); };
            setTimeout(() => n.close(), 6000);
        } catch (_) {}
    }

    /** In-app toast (tab visible, user not in that chat) */
    function _toastNotify(sender, body, conv) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const initials = (sender || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

        const toast = document.createElement('div');
        toast.className = 'toast toast--message';
        toast.style.cursor = 'pointer';
        toast.innerHTML = `
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${initials}</div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px;margin-bottom:2px">${escapeHTML(sender)}</div>
                <div style="font-size:12px;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(body)}</div>
            </div>`;

        if (conv && typeof openConversation === 'function') {
            toast.addEventListener('click', () => {
                openConversation(conv.conversation_id, conv.other_user);
                toast.remove();
            });
        }

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    /** Document title with unread count */
    function _updateTitle(total) {
        document.title = total > 0
            ? `(${total > 99 ? '99+' : total}) PrimeChat`
            : 'PrimeChat';
    }

    // ── Core Processing ──

    function _process(conversations) {
        let totalUnread   = 0;
        let soundNeeded   = false;
        let sidebarDirty  = false;

        for (const conv of conversations) {
            const id      = conv.conversation_id;
            const unread  = conv.unread_count || 0;
            const viewing = _isViewing(id);
            const prev    = _prevUnread[id];

            // Count total unreads (exclude chat user is looking at)
            if (!viewing) totalUnread += unread;

            // Detect NEW messages (unread went up since last check)
            if (prev !== undefined && unread > prev) {
                sidebarDirty = true;

                // Ensure the message isn't from the current user (optimistic updates could trigger this if not careful)
                const isFromMe = conv.last_message && conv.last_message.sender_id === window.appState?.user?.id;

                if (!viewing && !isFromMe) {
                    soundNeeded = true;
                    const sender  = conv.other_user?.display_name || 'Someone';
                    const preview = _preview(conv);

                    if (document.visibilityState === 'hidden') {
                        _browserNotify(sender, preview);
                    } else {
                        _toastNotify(sender, preview, conv);
                    }
                }
            }

            // Detect any change (unread went down = user read messages)
            if (prev !== undefined && unread !== prev) {
                sidebarDirty = true;
            }

            _prevUnread[id] = unread;
        }

        // Play sound once per cycle (not per conversation)
        if (soundNeeded) _beep();

        _updateTitle(totalUnread);

        // Merge updates into appState.conversations to preserve infinite scroll
        const existingMap = new Map((window.appState.conversations || []).map(c => [c.conversation_id, c]));
        conversations.forEach(c => { existingMap.set(c.conversation_id, c); });
        
        // Sort merged list by last message time
        window.appState.conversations = Array.from(existingMap.values()).sort((a, b) => {
            const tA = new Date(a.last_message?.time || a.last_message?.created_at || 0).getTime();
            const tB = new Date(b.last_message?.time || b.last_message?.created_at || 0).getTime();
            return tB - tA;
        });

        if (sidebarDirty && typeof renderConversations === 'function') {
            renderConversations();
        }
    }

    // ── Background Poll ──
    let _notifAbortController = null;

    async function _poll() {
        clearTimeout(_pollTimeout);
        if (_notifAbortController) _notifAbortController.abort();
        _notifAbortController = new AbortController();

        try {
            // Poll for top 20 conversations to catch recent activity
            const res = await api('/chat/conversations?limit=20', { signal: _notifAbortController.signal });
            if (!res?.success) return;
            const conversations = (res.data.conversations || res.data.cs || []).map(_remapConv);
            _process(conversations);
        } catch (e) {
            if (e.name === 'AbortError') return;
        } finally {
            const interval = document.visibilityState === 'visible' ? 5000 : 15000;
            _pollTimeout = setTimeout(_poll, interval);
        }
    }

    function _remapConv(c) {
        if (!c || c._remapped) return c;
        return {
            conversation_id: c.i,
            unread_count: c.uc,
            other_user: { display_name: c.u.n, id: c.u.i, status: c.u.s },
            last_message: { type: c.m.ty, content: c.m.c },
            _remapped: true
        };
    }

    // ── Public API ──

    function start() {
        if (_started) return;
        _started = true;

        // Defer browser notification permission to a user gesture
        // Attach to the document body exactly once
        if ('Notification' in window && Notification.permission === 'default') {
            const requestPerm = () => {
                Notification.requestPermission().then(p => { _permission = p; });
                document.body.removeEventListener('click', requestPerm);
            };
            document.body.addEventListener('click', requestPerm, { once: true });
        } else if ('Notification' in window) {
            _permission = Notification.permission;
        }

        // Baseline: capture current unreads WITHOUT firing notifications
        api('/chat/conversations?limit=20').then(res => {
            if (!res?.success) return;
            const convs = (res.data.conversations || res.data.cs || []).map(_remapConv);
            window.appState.conversations = convs;
            for (const c of convs) {
                _prevUnread[c.conversation_id] = c.unread_count || 0;
            }
            // Show initial title count
            const total = convs.reduce((s, c) => s + (c.unread_count || 0), 0);
            _updateTitle(total);
            // Render sidebar with initial data
            if (typeof renderConversations === 'function') renderConversations();
        }).catch(() => {});

        // Start polling
        _poll();
    }

    function stop() {
        clearTimeout(_pollTimeout);
        _pollTimeout = null;
        _started = false;
        _updateTitle(0);
    }

    /** Call when user opens a conversation — resets its baseline */
    function onChatOpened(convId) {
        if (convId) _prevUnread[convId] = 0;
    }

    return { start, stop, onChatOpened };
})();

// ── Bootstrap ──
// Wait for app.js to set appState.user (note: NOT currentUser — that was a bug)
document.addEventListener('DOMContentLoaded', () => {
    const wait = setInterval(() => {
        if (window.appState?.user) {
            clearInterval(wait);
            Notifier.start();
        }
    }, 500);
});

// ── Listen for chat open events ──
window.addEventListener('appStateChanged', e => {
    if (e.detail?.type === 'activeConversation') {
        Notifier.onChatOpened(window.appState.activeConversationId);
    }
});
