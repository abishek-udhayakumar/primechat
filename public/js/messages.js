/**
 * PrimeChat — Message Rendering (Performance Edition)
 * - DocumentFragment batching for all DOM insertions
 * - Event delegation: zero per-message listeners
 * - Passive scroll listeners (no jank on mobile)
 * - Cached date/time formatting
 * - DOM prune uses counter, not querySelectorAll
 * - Read-tick update capped to recent messages only
 */

'use strict';

const DOM_MESSAGE_LIMIT = 250; // max bubbles kept in DOM
let _domMsgCount = 0;          // fast counter — avoids querySelectorAll on every append

window.initMessages = () => {
    // Single delegated listener for context menu + reply clicks
    document.addEventListener('click', _handleDocClick, { passive: true });
    _bindContextMenuActions();
};

// ─────────────────────────────────────────
// DELEGATED CLICK HANDLER
// ─────────────────────────────────────────
let _ctxMsg = null;

function _handleDocClick(e) {
    // Context menu trigger
    const actionBtn = e.target.closest('.msg-action-btn');
    if (actionBtn) {
        const wrap = actionBtn.closest('.message[data-msg-id]');
        if (wrap) {
            const msg = window.appState.messages.find(m => m.id == wrap.dataset.msgId);
            if (msg) _showContextMenu(e, msg);
        }
        return;
    }

    // Reply-to click inside bubble
    const replyDiv = e.target.closest('.message-reply[data-reply-id]');
    if (replyDiv) {
        scrollToMessage(replyDiv.dataset.replyId);
        return;
    }

    // Image click
    const img = e.target.closest('.message-image img');
    if (img) {
        openImageViewer(img.src);
        return;
    }

    // Voice play
    const playBtn = e.target.closest('.voice-play-btn');
    if (playBtn) {
        _toggleVoice(playBtn);
        return;
    }

    // File download
    const fileDiv = e.target.closest('.message-file[data-src]');
    if (fileDiv) {
        window.open(fileDiv.dataset.src, '_blank');
        return;
    }

    // Close context menu on outside click
    if (!e.target.closest('#messageContextMenu')) {
        _hideContextMenu();
    }
}

// ─────────────────────────────────────────
// FULL RENDER — initial load only
// ─────────────────────────────────────────
window.renderMessages = () => {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.innerHTML = '';
    _domMsgCount = 0;

    if (!window.appState.messages.length) {
        const other = window.appState.activeOtherUser;
        if (other) {
            container.appendChild(_makeSystemMsg(
                `Start of your conversation with ${escapeHTML(other.display_name)}`
            ));
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
    if (!container || !msgs.length) return;

    // Cache last date/sender from DOM once (not per-message)
    let lastDate   = _lastRenderedDate(container);
    let lastSender = _lastRenderedSender(container);

    // Remove typing bubble temporarily
    const typingBubble = document.getElementById('typingBubble');
    if (typingBubble) typingBubble.remove();

    // Build all nodes in a DocumentFragment — single reflow
    const frag = document.createDocumentFragment();

    for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        const msgDate = _dateKey(msg.created_at);

        if (msgDate !== lastDate) {
            frag.appendChild(_makeDateDivider(_friendlyDate(msg.created_at), msgDate));
            lastDate   = msgDate;
            lastSender = null;
        }

        frag.appendChild(_buildBubble(msg, lastSender === msg.sender_id));
        lastSender = msg.sender_id;
        _domMsgCount++;
    }

    container.appendChild(frag);

    if (typingBubble) container.appendChild(typingBubble);

    _pruneDOM(container, 'top');
};

// ─────────────────────────────────────────
// PREPEND MESSAGES — older history
// ─────────────────────────────────────────
window._prependMessages = (msgs) => {
    const container = document.getElementById('messagesContainer');
    if (!container || !msgs.length) return;

    const frag = document.createDocumentFragment();
    let lastDate   = null;
    let lastSender = null;

    for (let i = 0; i < msgs.length; i++) {
        const msg     = msgs[i];
        const msgDate = _dateKey(msg.created_at);

        if (msgDate !== lastDate) {
            frag.appendChild(_makeDateDivider(_friendlyDate(msg.created_at), msgDate));
            lastDate   = msgDate;
            lastSender = null;
        }

        frag.appendChild(_buildBubble(msg, lastSender === msg.sender_id));
        lastSender = msg.sender_id;
        _domMsgCount++;
    }

    // Group-merge junction: check if last prepended & first existing share sender+date
    const firstExisting = container.querySelector('.message[data-msg-id]');
    if (firstExisting) {
        const firstMsg       = window.appState.messages.find(m => m.id == firstExisting.dataset.msgId);
        const lastPrepended  = msgs[msgs.length - 1];
        if (firstMsg && lastPrepended &&
            firstMsg.sender_id === lastPrepended.sender_id &&
            _dateKey(firstMsg.created_at) === _dateKey(lastPrepended.created_at)) {
            firstExisting.classList.add('grouped');
        }

        // Remove duplicate date divider at junction
        const firstDivider = container.querySelector('.message-date-divider');
        if (firstDivider && firstDivider.dataset.date === lastDate) {
            firstDivider.remove();
        }
    }

    container.insertBefore(frag, container.firstChild);
    _pruneDOM(container, 'bottom');
};

// ─────────────────────────────────────────
// DOM PRUNING — remove oldest when over limit
// ─────────────────────────────────────────
function _pruneDOM(container, direction = 'top') {
    if (_domMsgCount <= DOM_MESSAGE_LIMIT) return;

    container = container || document.getElementById('messagesContainer');
    if (!container) return;

    const excess = _domMsgCount - DOM_MESSAGE_LIMIT;
    const bubbles = Array.from(container.querySelectorAll('.message[data-msg-id]'));
    
    const toRemove = Math.min(excess, bubbles.length);
    if (toRemove <= 0) return;

    const removeTargets = direction === 'top' 
        ? bubbles.slice(0, toRemove) 
        : bubbles.slice(-toRemove);

    removeTargets.forEach(bubble => {
        const prev = bubble.previousElementSibling;
        bubble.remove();
        // Clean up orphaned date dividers
        if (prev && prev.classList.contains('message-date-divider')) {
            const next = prev.nextElementSibling;
            if (!next || next.classList.contains('message-date-divider')) {
                prev.remove();
            }
        }
    });

    _domMsgCount = Math.max(0, _domMsgCount - toRemove);

    // Sync appState array in tandem
    if (window.appState?.messages) {
        if (direction === 'top') {
            window.appState.messages = window.appState.messages.slice(toRemove);
        } else {
            window.appState.messages = window.appState.messages.slice(0, window.appState.messages.length - toRemove);
            window.appState.lastMessageId = window.appState.messages.length ? _lastId(window.appState.messages) : 0;
        }
    }
}

// ─────────────────────────────────────────
// BUILD MESSAGE BUBBLE (no inline listeners)
// ─────────────────────────────────────────
function _buildBubble(msg, isGrouped) {
    const wrap = document.createElement('div');
    wrap.className = `message ${msg.is_mine ? 'sent' : 'received'}${isGrouped ? ' grouped' : ''}`;
    wrap.id        = `msg_${msg.id}`;
    wrap.dataset.msgId = msg.id;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Forwarded label
    if (msg.forwarded_from_id) {
        bubble.appendChild(_el('div', 'message-forwarded',
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg> Forwarded`
        ));
    }

    // Reply preview (data-reply-id used by delegated listener)
    if (msg.reply) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'message-reply';
        replyDiv.dataset.replyId = msg.reply.id;
        replyDiv.innerHTML =
            `<div class="message-reply-name">${escapeHTML(msg.reply.sender_name || '')}</div>
             <div class="message-reply-text">${_previewText(msg.reply)}</div>`;
        bubble.appendChild(replyDiv);
    }

    // Content
    if (msg.is_deleted_for_everyone) {
        bubble.appendChild(_el('div', 'message-deleted',
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> This message was deleted`
        ));
    } else {
        _buildContent(bubble, msg);
    }

    // Meta row
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

    // Action button (delegated click in _handleDocClick)
    if (!msg.is_deleted_for_everyone) {
        bubble.appendChild(_el('div', 'msg-action-btn',
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`
        ));
    }

    wrap.appendChild(bubble);
    return wrap;
}

function _buildContent(bubble, msg) {
    if (msg.type === 'image' && msg.attachment) {
        const wrap = document.createElement('div');
        wrap.className = 'message-image';
        const img = document.createElement('img');
        const src = '/' + msg.attachment.file_path;
        img.alt     = 'Image';
        img.loading = 'lazy';
        img.decoding = 'async';

        img.decoding = 'async';

        if (msg.attachment._isUploading) {
            img.src = src; // local blob URL
            const progressWrapper = document.createElement('div');
            progressWrapper.className = 'upload-progress-wrapper';
            progressWrapper.innerHTML = `<div class="upload-progress-bar"></div>`;
            wrap.appendChild(progressWrapper);
        } else if (window._imgObserver) {
            img.dataset.lazySrc = src;
            img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E'; // tiny placeholder
            img.style.minHeight = '80px';
            img.style.background = 'var(--color-surface)';
            window._imgObserver.observe(img);
        } else {
            img.src = src; // fallback
        }

        wrap.appendChild(img);
        bubble.appendChild(wrap);
        if (msg.content) bubble.appendChild(_el('div', 'message-text', escapeHTML(msg.content)));
        return;
    }

    if (msg.type === 'file' && msg.attachment) {
        const f = msg.attachment;
        const fileDiv = document.createElement('div');
        fileDiv.className = 'message-file';
        fileDiv.dataset.src = '/' + f.file_path; // used by delegated listener
        
        let progressHTML = '';
        if (f._isUploading) {
            progressHTML = `<div class="upload-progress-wrapper" style="position:absolute; bottom:0; left:0; right:0; height:4px; border-radius:0 0 var(--radius-md) var(--radius-md);"><div class="upload-progress-bar"></div></div>`;
            fileDiv.style.position = 'relative';
        }

        fileDiv.innerHTML =
            `<div class="message-file-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
             </div>
             <div class="message-file-info">
                <div class="message-file-name">${escapeHTML(f.file_name)}</div>
                <div class="message-file-size">${formatSize(f.file_size || 0)}</div>
             </div>
             ${progressHTML}`;
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
        bubble.appendChild(voiceDiv);
        return;
    }

    // Text
    if (msg.content != null) {
        bubble.appendChild(_el('div', 'message-text', escapeHTML(msg.content)));
    }
}

// ─────────────────────────────────────────
// CONTEXT MENU
// ─────────────────────────────────────────
function _showContextMenu(e, msg) {
    _ctxMsg = msg;
    const menu = document.getElementById('messageContextMenu');
    if (!menu) return;

    document.getElementById('menuEdit').style.display           = msg.is_mine ? 'flex' : 'none';
    document.getElementById('menuDeleteEveryone').style.display  = msg.is_mine ? 'flex' : 'none';

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
        const res = await api('/chat/delete', { method: 'POST', body: { message_id: msgId, delete_type: type } });
        if (res?.success) {
            if (type === 'for_everyone') {
                const msg = window.appState.messages.find(m => m.id == msgId);
                if (msg) msg.is_deleted_for_everyone = true;
                const el = document.getElementById(`msg_${msgId}`);
                if (el) {
                    const content = el.querySelector('.message-text, .message-image, .message-file, .message-voice');
                    if (content) {
                        content.className = 'message-deleted';
                        content.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> This message was deleted`;
                    }
                    el.querySelector('.msg-action-btn')?.remove();
                }
            } else {
                window.appState.messages = window.appState.messages.filter(m => m.id != msgId);
                document.getElementById(`msg_${msgId}`)?.remove();
                _domMsgCount = Math.max(0, _domMsgCount - 1);
            }
        }
    } catch (_) {
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
    el.classList.add('msg-highlight');
    setTimeout(() => el.classList.remove('msg-highlight'), 1200);
};

// ─────────────────────────────────────────
// VOICE PLAYBACK
// ─────────────────────────────────────────
let _currentAudio = null;
let _currentAudioBtn = null;

function _toggleVoice(btn) {
    const src = btn.dataset.src;
    if (!src) return;

    // Helper to reset a button's UI to paused state
    const resetUI = (button) => {
        if (!button) return;
        button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        const wrapper = button.closest('.message-voice');
        if (wrapper) {
            const bars = wrapper.querySelectorAll('.voice-waveform-bar');
            bars.forEach(bar => bar.classList.remove('played'));
            const durationEl = wrapper.querySelector('.voice-duration');
            if (durationEl && durationEl.dataset.originalDuration) {
                durationEl.textContent = durationEl.dataset.originalDuration;
            }
        }
    };

    // If clicking the currently playing button
    if (_currentAudio && _currentAudioBtn === btn) {
        if (!_currentAudio.paused) {
            _currentAudio.pause();
            resetUI(btn);
        } else {
            _currentAudio.play();
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        }
        return;
    }

    // Stop and reset any other playing audio
    if (_currentAudio) {
        _currentAudio.pause();
        resetUI(_currentAudioBtn);
    }

    // Create new audio instance
    _currentAudio = new Audio(src);
    _currentAudioBtn = btn;
    
    const wrapper = btn.closest('.message-voice');
    const bars = wrapper ? wrapper.querySelectorAll('.voice-waveform-bar') : [];
    const durationEl = wrapper ? wrapper.querySelector('.voice-duration') : null;
    
    if (durationEl && !durationEl.dataset.originalDuration) {
        durationEl.dataset.originalDuration = durationEl.textContent;
    }

    _currentAudio.addEventListener('timeupdate', () => {
        if (!_currentAudio || !_currentAudio.duration) return;
        const percent = _currentAudio.currentTime / _currentAudio.duration;
        
        // Update bars
        const activeBarsCount = Math.floor(percent * bars.length);
        bars.forEach((bar, index) => {
            if (index < activeBarsCount) {
                bar.classList.add('played');
            } else {
                bar.classList.remove('played');
            }
        });
        
        // Update duration text
        if (durationEl) {
            const currentSecs = Math.floor(_currentAudio.currentTime);
            const totalSecs = Math.floor(_currentAudio.duration) || parseInt(durationEl.dataset.originalDuration.replace('s','')) || 0;
            const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;
            durationEl.textContent = `${formatTime(currentSecs)} / ${formatTime(totalSecs)}`;
        }
    });

    _currentAudio.play().then(() => {
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        _currentAudio.onended = () => {
            resetUI(btn);
            _currentAudio = null;
            _currentAudioBtn = null;
        };
    }).catch(() => showToast('Cannot play audio', 'error'));
}

// ─────────────────────────────────────────
// HELPERS
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

// Cached date/time formatters — avoid repeated Date object construction
const _dtCache = new Map();
function _dateKey(ts) {
    if (!ts) return '';
    let k = _dtCache.get(ts + '_dk');
    if (!k) { k = new Date(ts).toDateString(); _dtCache.set(ts + '_dk', k); }
    return k;
}

const _todayStr = new Date().toDateString();
const _yesterStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toDateString(); })();
function _friendlyDate(ts) {
    if (!ts) return '';
    const dk = _dateKey(ts);
    if (dk === _todayStr)   return 'Today';
    if (dk === _yesterStr)  return 'Yesterday';
    return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function _formatMsgTime(ts) {
    if (!ts) return '';
    let k = _dtCache.get(ts + '_tm');
    if (!k) { k = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); _dtCache.set(ts + '_tm', k); }
    return k;
}

function _tickSVG(status) {
    if (status === 'sent') {
        return `<svg viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 6 10 14 2"/></svg>`;
    }
    return `<svg viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 6 10 14 2"/><polyline points="10 10 14 14 22 6"/></svg>`;
}

function _lastRenderedDate(container) {
    // Walk backwards — faster than querySelectorAll when DOM is big
    let node = container.lastChild;
    while (node) {
        if (node.classList?.contains('message-date-divider')) return node.dataset.date;
        node = node.previousSibling;
    }
    return null;
}

function _lastRenderedSender(container) {
    // Walk backwards for last real message bubble
    let node = container.lastChild;
    while (node) {
        if (node.dataset?.msgId) {
            const msg = window.appState.messages.find(m => m.id == node.dataset.msgId);
            return msg?.sender_id ?? null;
        }
        node = node.previousSibling;
    }
    return null;
}
