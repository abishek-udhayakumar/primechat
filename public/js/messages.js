/**
 * PrimeChat — Message Rendering
 * Full render on initial load, incremental append for new messages.
 * Eliminates the full DOM wipe + rebuild on every poll tick.
 */

'use strict';

window.initMessages = () => {
    // Close context menu on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#messageContextMenu') && !e.target.closest('.msg-action-btn')) {
            _hideContextMenu();
        }
    });
    _bindContextMenuActions();
};

// ─────────────────────────────────────────
// FULL RENDER — initial load only
// ─────────────────────────────────────────
window.renderMessages = () => {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!window.appState.messages.length) {
        const other = window.appState.activeOtherUser;
        if (other) {
            // Don't pre-insert a Today divider here — _appendMessages handles it
            container.appendChild(_makeSystemMsg(`Start of your conversation with ${escapeHTML(other.display_name)}`));
        }
        return;
    }

    _appendMessages(window.appState.messages, container);
};

// ─────────────────────────────────────────
// INCREMENTAL APPEND — new messages only
// ─────────────────────────────────────────
window._appendMessages = (msgs, container) => {
    container = container || document.getElementById('messagesContainer');
    if (!container) return;

    let lastDate   = _lastRenderedDate(container);
    let lastSender = _lastRenderedSender(container);

    const typingBubble = document.getElementById('typingBubble');
    if (typingBubble) typingBubble.remove();

    msgs.forEach(msg => {
        const msgDate = _dateKey(msg.created_at);

        // Only insert a date divider when the date actually changes
        if (msgDate !== lastDate) {
            container.appendChild(_makeDateDivider(_friendlyDate(msg.created_at), msgDate));
            lastDate   = msgDate;
            lastSender = null;
        }

        const isSameGroup = lastSender === msg.sender_id;
        container.appendChild(_buildBubble(msg, isSameGroup));
        lastSender = msg.sender_id;
    });

    if (typingBubble) container.appendChild(typingBubble);
};

// ─────────────────────────────────────────
// BUILD MESSAGE BUBBLE
// ─────────────────────────────────────────
function _buildBubble(msg, isGrouped) {
    const wrap = document.createElement('div');
    wrap.className = `message ${msg.is_mine ? 'sent' : 'received'}${isGrouped ? ' grouped' : ''}`;
    wrap.id        = `msg_${msg.id}`;
    wrap.dataset.msgId = msg.id;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // ── Forwarded label ──
    if (msg.forwarded_from_id) {
        bubble.appendChild(_el('div', 'message-forwarded',
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg> Forwarded`
        ));
    }

    // ── Reply preview ──
    if (msg.reply) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'message-reply';
        replyDiv.dataset.replyId = msg.reply.id;
        replyDiv.innerHTML =
            `<div class="message-reply-name">${escapeHTML(msg.reply.sender_name || '')}</div>
             <div class="message-reply-text">${_previewText(msg.reply)}</div>`;
        replyDiv.addEventListener('click', () => scrollToMessage(msg.reply.id));
        bubble.appendChild(replyDiv);
    }

    // ── Content ──
    if (msg.is_deleted_for_everyone) {
        bubble.appendChild(_el('div', 'message-deleted',
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
             This message was deleted`
        ));
    } else {
        _buildContent(bubble, msg);
    }

    // ── Meta row (time + ticks) ──
    const meta = document.createElement('div');
    meta.className = 'message-meta';

    if (msg.is_edited && !msg.is_deleted_for_everyone) {
        meta.appendChild(_el('span', 'message-edited', 'edited'));
    }

    meta.appendChild(_el('span', 'message-time', _formatMsgTime(msg.created_at)));

    if (msg.is_mine) {
        const tick = document.createElement('span');
        tick.className = `message-ticks ${msg.read_status || 'sent'}`;
        tick.innerHTML = _tickSVG(msg.read_status || 'sent');
        meta.appendChild(tick);
    }

    bubble.appendChild(meta);

    // ── Action trigger (⌄ button on hover) ──
    if (!msg.is_deleted_for_everyone) {
        const btn = document.createElement('div');
        btn.className = 'msg-action-btn';
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            _showContextMenu(e, msg);
        });
        bubble.appendChild(btn);
    }

    wrap.appendChild(bubble);
    return wrap;
}

function _buildContent(bubble, msg) {
    if (msg.type === 'image' && msg.attachment) {
        const wrap = document.createElement('div');
        wrap.className = 'message-image';
        const img = document.createElement('img');
        img.src     = '/' + msg.attachment.file_path;
        img.alt     = 'Image';
        img.loading = 'lazy';
        img.addEventListener('click', () => openImageViewer('/' + msg.attachment.file_path));
        wrap.appendChild(img);
        bubble.appendChild(wrap);
        if (msg.content) bubble.appendChild(_el('div', 'message-text', escapeHTML(msg.content)));
        return;
    }

    if (msg.type === 'file' && msg.attachment) {
        const f = msg.attachment;
        const fileDiv = document.createElement('div');
        fileDiv.className = 'message-file';
        fileDiv.innerHTML =
            `<div class="message-file-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
             </div>
             <div class="message-file-info">
                <div class="message-file-name">${escapeHTML(f.file_name)}</div>
                <div class="message-file-size">${formatSize(f.file_size || 0)}</div>
             </div>`;
        fileDiv.addEventListener('click', () => window.open('/' + f.file_path, '_blank'));
        bubble.appendChild(fileDiv);
        return;
    }

    if (msg.type === 'voice' && msg.attachment) {
        const bars = Array.from({ length: 20 }, (_, i) => {
            const h = 20 + Math.abs(Math.sin(i * 0.8)) * 80;
            return `<div class="voice-waveform-bar" style="height:${h}%"></div>`;
        }).join('');

        const voiceDiv = document.createElement('div');
        voiceDiv.className = 'message-voice';
        voiceDiv.innerHTML =
            `<div class="voice-play-btn" data-src="/${msg.attachment.file_path}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
             </div>
             <div class="voice-waveform">${bars}</div>
             <div class="voice-duration">${msg.attachment.duration ? msg.attachment.duration + 's' : '0:00'}</div>`;

        voiceDiv.querySelector('.voice-play-btn').addEventListener('click', function () {
            _toggleVoice(this);
        });
        bubble.appendChild(voiceDiv);
        return;
    }

    // Default: text
    if (msg.content != null) {
        bubble.appendChild(_el('div', 'message-text', escapeHTML(msg.content)));
    }
}

// ─────────────────────────────────────────
// CONTEXT MENU
// ─────────────────────────────────────────
let _ctxMsg = null;

function _showContextMenu(e, msg) {
    _ctxMsg = msg;
    const menu = document.getElementById('messageContextMenu');
    if (!menu) return;

    // Show/hide owner-only actions
    document.getElementById('menuEdit').style.display          = msg.is_mine ? 'flex' : 'none';
    document.getElementById('menuDeleteEveryone').style.display = msg.is_mine ? 'flex' : 'none';

    // Position
    const x = Math.min(e.clientX, window.innerWidth  - 200);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    menu.classList.remove('hidden');
}

function _hideContextMenu() {
    document.getElementById('messageContextMenu')?.classList.add('hidden');
    _ctxMsg = null;
}

function _bindContextMenuActions() {
    document.getElementById('menuReply')?.addEventListener('click', () => {
        if (_ctxMsg) replyToMessage(_ctxMsg.id);
        _hideContextMenu();
    });

    document.getElementById('menuDeleteMe')?.addEventListener('click', async () => {
        if (!_ctxMsg) return;
        await _deleteMessage(_ctxMsg.id, 'for_me');
        _hideContextMenu();
    });

    document.getElementById('menuDeleteEveryone')?.addEventListener('click', async () => {
        if (!_ctxMsg) return;
        await _deleteMessage(_ctxMsg.id, 'for_everyone');
        _hideContextMenu();
    });

    document.getElementById('menuForward')?.addEventListener('click', () => {
        showToast('Forward coming soon');
        _hideContextMenu();
    });
}

async function _deleteMessage(msgId, type) {
    try {
        const res = await api('/chat/delete', {
            method : 'POST',
            body   : { message_id: msgId, delete_type: type }
        });
        if (res?.success) {
            if (type === 'for_everyone') {
                const msg = window.appState.messages.find(m => m.id == msgId);
                if (msg) msg.is_deleted_for_everyone = true;
                // Update DOM
                const el = document.getElementById(`msg_${msgId}`);
                if (el) {
                    const content = el.querySelector('.message-text, .message-image, .message-file, .message-voice');
                    if (content) {
                        content.className = 'message-deleted';
                        content.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> This message was deleted';
                    }
                    el.querySelector('.msg-action-btn')?.remove();
                }
            } else {
                window.appState.messages = window.appState.messages.filter(m => m.id != msgId);
                document.getElementById(`msg_${msgId}`)?.remove();
            }
        }
    } catch (e) {
        showToast('Delete failed', 'error');
    }
}

// ─────────────────────────────────────────
// IMAGE VIEWER
// ─────────────────────────────────────────
window.openImageViewer = (src) => {
    const viewer = document.getElementById('imageViewer');
    const img    = document.getElementById('viewerImage');
    if (!viewer || !img) return;
    img.src = src;
    viewer.classList.add('show');

    const close = () => { viewer.classList.remove('show'); img.src = ''; };
    document.getElementById('closeImageViewer').onclick = close;
    viewer.onclick = (e) => { if (e.target === viewer) close(); };
};

window.scrollToMessage = (msgId) => {
    const el = document.getElementById(`msg_${msgId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'background 0.3s';
    el.style.background = 'rgba(99,102,241,0.18)';
    setTimeout(() => { el.style.background = ''; }, 1200);
};

// ─────────────────────────────────────────
// VOICE PLAYBACK
// ─────────────────────────────────────────
let _currentAudio = null;

function _toggleVoice(btn) {
    const src = btn.dataset.src;
    if (!src) return;

    if (_currentAudio && !_currentAudio.paused) {
        _currentAudio.pause();
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        return;
    }

    _currentAudio = new Audio(src);
    _currentAudio.play().then(() => {
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        _currentAudio.onended = () => {
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        };
    }).catch(() => showToast('Cannot play audio', 'error'));
}

// ─────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────
function _el(tag, cls, html = '') {
    const el = document.createElement(tag);
    el.className = cls;
    el.innerHTML = html;
    return el;
}

function _makeDateDivider(label, dateKey) {
    const div = document.createElement('div');
    div.className = 'message-date-divider';
    // Store the raw dateKey (e.g. "Mon Apr 21 2026") for comparison,
    // display the friendly label (e.g. "Today")
    div.dataset.date = dateKey || label;
    div.innerHTML = `<span>${label}</span>`;
    return div;
}

function _makeSystemMsg(text) {
    const div = document.createElement('div');
    div.className = 'message-system';
    div.innerHTML = `<span>${text}</span>`;
    return div;
}

function _previewText(msg) {
    if (!msg) return '';
    if (msg.type === 'image') return '📷 Photo';
    if (msg.type === 'file')  return '📎 File';
    if (msg.type === 'voice') return '🎤 Voice';
    return escapeHTML(msg.content || '');
}

function _dateKey(ts) {
    if (!ts) return '';
    return new Date(ts).toDateString();
}

function _friendlyDate(ts) {
    if (!ts) return '';
    const d   = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function _formatMsgTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function _tickSVG(status) {
    if (status === 'sent') {
        return '<svg viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 6 10 14 2"/></svg>';
    }
    return '<svg viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 6 10 14 2"/><polyline points="10 10 14 14 22 6"/></svg>';
}

function _lastRenderedDate(container) {
    const dividers = container.querySelectorAll('.message-date-divider');
    return dividers.length ? dividers[dividers.length - 1].dataset.date : null;
}

function _lastRenderedSender(container) {
    const msgs = container.querySelectorAll('.message[data-msg-id]');
    if (!msgs.length) return null;
    return window.appState.messages.find(m => m.id == msgs[msgs.length - 1].dataset.msgId)?.sender_id ?? null;
}
