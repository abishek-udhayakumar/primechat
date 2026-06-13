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

    // Reaction pill click (delegated)
    const reactionPill = e.target.closest('.reaction-pill');
    if (reactionPill) {
        e.stopPropagation();
        const msgId = reactionPill.dataset.msgId;
        const emoji = reactionPill.dataset.emoji;
        if (msgId && emoji) _toggleReaction(parseInt(msgId), emoji);
        return;
    }

    // Add reaction button click (delegated)
    const addReactionBtn = e.target.closest('.msg-add-reaction');
    if (addReactionBtn) {
        e.stopPropagation();
        const msgId = addReactionBtn.dataset.msgId;
        if (msgId) _showReactionPicker(e, parseInt(msgId));
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
window.renderMessages = (msgs) => {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.innerHTML = '';
    _domMsgCount = 0;

    // Use passed messages or fall back to appState
    const messages = msgs || window.appState.messages;

    if (!messages.length) {
        const other = window.appState.activeOtherUser;
        if (other) {
            container.appendChild(_makeSystemMsg(
                `Start of your conversation with ${escapeHTML(other.display_name)}`
            ));
        }
        return;
    }

    _appendMessages(messages, container, true); // true = batch/initial
};

// ─────────────────────────────────────────
// INCREMENTAL APPEND — new messages only
// ─────────────────────────────────────────
window._appendMessages = (msgs, container, isBatch = false) => {
    container = container || document.getElementById('messagesContainer');
    if (!container || !msgs.length) return;

    // Cache last date/sender from DOM once (not per-message)
    let lastDate   = _lastRenderedDate(container);
    let lastSender = _lastRenderedSender(container);
    let lastTime   = _lastRenderedTime(container);

    // Remove typing bubble temporarily
    const typingBubble = document.getElementById('typingBubble');
    if (typingBubble) typingBubble.remove();

    // Build all nodes in a DocumentFragment — single reflow
    const frag = document.createDocumentFragment();

    for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        const msgDate = _dateKey(msg.created_at);

        // Calculate time gap from previous message
        if (lastTime && msg.created_at) {
            msg._timeGapFromPrev = new Date(msg.created_at) - new Date(lastTime);
        }

        if (msgDate !== lastDate) {
            frag.appendChild(_makeDateDivider(_friendlyDate(msg.created_at), msgDate));
            lastDate   = msgDate;
            lastSender = null;
            lastTime   = null;
        }

        const bubble = _buildBubble(msg, lastSender === msg.sender_id);
        // Disable entry animation during batch loads (prevents 50+ simultaneous animations)
        if (isBatch) bubble.classList.add('no-anim');
        frag.appendChild(bubble);
        lastSender = msg.sender_id;
        lastTime = msg.created_at;
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
    let lastTime   = null;

    for (let i = 0; i < msgs.length; i++) {
        const msg     = msgs[i];
        const msgDate = _dateKey(msg.created_at);

        // Calculate time gap from previous message in this batch
        if (lastTime && msg.created_at) {
            msg._timeGapFromPrev = new Date(msg.created_at) - new Date(lastTime);
        }

        if (msgDate !== lastDate) {
            frag.appendChild(_makeDateDivider(_friendlyDate(msg.created_at), msgDate));
            lastDate   = msgDate;
            lastSender = null;
            lastTime   = null;
        }

        frag.appendChild(_buildBubble(msg, lastSender === msg.sender_id));
        lastSender = msg.sender_id;
        lastTime = msg.created_at;
        _domMsgCount++;
    }

    // Group-merge junction: check if last prepended & first existing share sender+date+time gap
    const firstExisting = container.querySelector('.message[data-msg-id]');
    if (firstExisting) {
        const firstMsg       = window.appState.messages.find(m => m.id == firstExisting.dataset.msgId);
        const lastPrepended  = msgs[msgs.length - 1];
        if (firstMsg && lastPrepended &&
            firstMsg.sender_id === lastPrepended.sender_id &&
            _dateKey(firstMsg.created_at) === _dateKey(lastPrepended.created_at)) {
            // Also check time gap at the junction
            const gapMs = new Date(firstMsg.created_at) - new Date(lastPrepended.created_at);
            if (gapMs <= 300000) { // 5 minutes
                firstExisting.classList.add('grouped');
            }
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
    // Also break grouping if time gap > 5 minutes from previous message
    const finalGrouped = isGrouped && msg._timeGapFromPrev != null ? msg._timeGapFromPrev <= 300000 : isGrouped;
    wrap.className = `message ${msg.is_mine ? 'sent' : 'received'}${finalGrouped ? ' grouped' : ''}`;
    wrap.id        = `msg_${msg.id}`;
    wrap.dataset.msgId = msg.id;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Show sender name for group conversations (non-self messages)
    const isGroup = window.appState.activeGroupInfo?.isGroup;
    if (isGroup && !msg.is_mine && !isGrouped && msg.sender_name) {
        bubble.appendChild(_el('div', 'message-sender-name', escapeHTML(msg.sender_name)));
    }

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

    // Reactions
    if (msg.reactions && msg.reactions.length > 0) {
        const reactionsRow = document.createElement('div');
        reactionsRow.className = 'message-reactions';
        reactionsRow.dataset.msgId = msg.id;
        msg.reactions.forEach(r => {
            const pill = document.createElement('span');
            pill.className = `reaction-pill${r.m ? ' reacted' : ''}`;
            pill.dataset.emoji = r.e;
            pill.dataset.msgId = msg.id;
            pill.textContent = `${r.e} ${r.c}`;
            // No inline listener — handled by delegated click in _handleDocClick
            reactionsRow.appendChild(pill);
        });
        bubble.appendChild(reactionsRow);
    }

    // Add reaction button (delegated click in _handleDocClick)
    if (!msg.is_deleted_for_everyone) {
        const addReactionBtn = document.createElement('div');
        addReactionBtn.className = 'msg-add-reaction';
        addReactionBtn.dataset.msgId = msg.id;
        addReactionBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
        // No inline listener — handled by delegated click in _handleDocClick
        bubble.appendChild(addReactionBtn);
    }

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
            progressWrapper.innerHTML = `<div class="upload-progress-bar"></div><span class="upload-progress-pct">0%</span><button class="upload-cancel-btn" title="Cancel">✕</button>`;
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
            progressHTML = `<div class="upload-progress-wrapper" style="position:absolute; bottom:0; left:0; right:0; height:4px; border-radius:0 0 var(--radius-md) var(--radius-md);"><div class="upload-progress-bar"></div><span class="upload-progress-pct">0%</span><button class="upload-cancel-btn" title="Cancel">✕</button></div>`;
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

    document.getElementById('menuEdit').style.display           = msg.is_mine && msg.type === 'text' ? 'flex' : 'none';
    document.getElementById('menuDeleteEveryone').style.display  = msg.is_mine ? 'flex' : 'none';
    // Show "View History" for messages that have been edited
    const historyItem = document.getElementById('menuViewHistory');
    if (historyItem) {
        historyItem.style.display = (msg.is_mine && msg.is_edited) ? 'flex' : 'none';
    }

    const x = Math.min(e.clientX, window.innerWidth  - 220);
    const y = Math.min(e.clientY, window.innerHeight - 240);
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

    // Edit message — enter inline edit mode
    document.getElementById('menuEdit')?.addEventListener('click', async () => {
        if (!_ctxMsg || _ctxMsg.type !== 'text') return;
        _hideContextMenu();
        _enterEditMode(_ctxMsg);
    });

    // View edit history
    document.getElementById('menuViewHistory')?.addEventListener('click', async () => {
        if (!_ctxMsg) return;
        const msg = _ctxMsg;
        _hideContextMenu();
        await window._ensureHistory?.();
        if (window.EditHistory) {
            window.EditHistory.showEditHistory(msg.id, msg.content);
        } else {
            showToast('History not available', 'info');
        }
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
        if (_ctxMsg) _showForwardModal(_ctxMsg.id);
        _hideContextMenu();
    });
}

// ─────────────────────────────────────────
// INLINE EDIT MODE
// ─────────────────────────────────────────
function _enterEditMode(msg) {
    const el = document.getElementById(`msg_${msg.id}`);
    if (!el) return;

    const textEl = el.querySelector('.message-text');
    if (!textEl) return;

    const originalContent = msg.content;

    // Record old content BEFORE edit (for history diff)
    window._ensureHistory?.().then(() => {
        window.EditHistory?.beforeEdit(msg.id, originalContent);
    });

    // Build inline editor
    const editContainer = document.createElement('div');
    editContainer.className = 'msg-edit-container';
    editContainer.innerHTML = `
        <textarea class="msg-edit-input" rows="1">${escapeHTML(originalContent)}</textarea>
        <div class="msg-edit-actions">
            <button class="btn btn--ghost msg-edit-cancel" style="font-size:12px;height:28px;padding:0 10px;">Cancel</button>
            <button class="btn btn--primary msg-edit-save" style="font-size:12px;height:28px;padding:0 10px;">Save</button>
        </div>
    `;

    textEl.replaceWith(editContainer);

    const textarea = editContainer.querySelector('.msg-edit-input');
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Auto-resize
    textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    });

    // Cancel
    editContainer.querySelector('.msg-edit-cancel').addEventListener('click', () => {
        const restored = document.createElement('span');
        restored.className = 'message-text';
        restored.innerHTML = linkifyContent(originalContent);
        editContainer.replaceWith(restored);
    });

    // Save
    editContainer.querySelector('.msg-edit-save').addEventListener('click', async () => {
        const newContent = textarea.value.trim();
        if (!newContent || newContent === originalContent) {
            editContainer.querySelector('.msg-edit-cancel').click();
            return;
        }

        const saveBtn = editContainer.querySelector('.msg-edit-save');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner spinner--sm"></span>';

        try {
            const res = await api('/chat/edit', {
                method: 'POST',
                body: { message_id: msg.id, content: newContent },
            });

            if (res?.success) {
                // Record edit in history
                window._ensureHistory?.().then(() => {
                    window.EditHistory?.afterEdit(msg.id, newContent);
                });

                // Update DOM
                const textNode = document.createElement('span');
                textNode.className = 'message-text';
                textNode.innerHTML = linkifyContent(newContent);
                editContainer.replaceWith(textNode);

                // Update appState
                const stateMsg = window.appState.messages.find(m => m.id === msg.id);
                if (stateMsg) { stateMsg.content = newContent; stateMsg.is_edited = true; }

                // Add/update 'edited' indicator
                const metaEl = el.querySelector('.message-meta');
                if (metaEl && !metaEl.querySelector('.message-edited')) {
                    const editedSpan = document.createElement('span');
                    editedSpan.className = 'message-edited';
                    editedSpan.textContent = 'edited';
                    metaEl.prepend(editedSpan);
                }

                showToast('Message edited', 'success');
            } else {
                showToast(res?.error || 'Edit failed', 'error');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
        } catch (e) {
            showToast('Edit failed', 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    });

    // Keyboard shortcuts
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') editContainer.querySelector('.msg-edit-cancel').click();
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            editContainer.querySelector('.msg-edit-save').click();
        }
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
// REACTIONS
// ─────────────────────────────────────────

const REACTION_EMOJIS = ['👍', '❤️', '😄', '😮', '😢', '🙏'];

let _reactionPickerEl = null;

async function _toggleReaction(msgId, emoji) {
    try {
        const res = await api('/chat/react', {
            method: 'POST',
            body: { message_id: msgId, emoji }
        });
        if (res?.success) {
            // Update reactions in appState
            const msg = window.appState.messages.find(m => m.id === msgId);
            if (msg) {
                msg.reactions = res.data.reactions;
                // Re-build reactions row for this message
                _updateReactionsRow(msgId, res.data.reactions);
            }
        }
    } catch (e) {
        console.error('[PrimeChat] Reaction failed:', e);
    }
}

function _showReactionPicker(e, msgId) {
    _hideReactionPicker();

    _reactionPickerEl = document.createElement('div');
    _reactionPickerEl.className = 'reaction-picker';
    _reactionPickerEl.style.position = 'fixed';
    _reactionPickerEl.style.left = Math.min(e.clientX, window.innerWidth - 260) + 'px';
    _reactionPickerEl.style.top = (e.clientY - 50) + 'px';

    REACTION_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'reaction-picker-btn';
        btn.textContent = emoji;
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            _toggleReaction(msgId, emoji);
            _hideReactionPicker();
        });
        _reactionPickerEl.appendChild(btn);
    });

    document.body.appendChild(_reactionPickerEl);

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', _hideReactionPicker, { once: true });
    }, 0);
}

function _hideReactionPicker() {
    if (_reactionPickerEl) {
        _reactionPickerEl.remove();
        _reactionPickerEl = null;
    }
}

function _updateReactionsRow(msgId, reactions) {
    const msgEl = document.querySelector(`.message[data-msg-id="${msgId}"]`);
    if (!msgEl) return;

    const bubble = msgEl.querySelector('.message-bubble');
    if (!bubble) return;

    // Remove old reactions row
    const oldRow = bubble.querySelector('.message-reactions');
    if (oldRow) oldRow.remove();

    // Add new reactions row
    if (reactions && reactions.length > 0) {
        const reactionsRow = document.createElement('div');
        reactionsRow.className = 'message-reactions';
        reactionsRow.dataset.msgId = msgId;
        reactions.forEach(r => {
            const pill = document.createElement('span');
            pill.className = `reaction-pill${r.m ? ' reacted' : ''}`;
            pill.dataset.emoji = r.e;
            pill.dataset.msgId = msgId;
            pill.textContent = `${r.e} ${r.c}`;
            // No inline listener — handled by delegated click in _handleDocClick
            reactionsRow.appendChild(pill);
        });
        // Insert before the add-reaction button
        const addBtn = bubble.querySelector('.msg-add-reaction');
        if (addBtn) {
            bubble.insertBefore(reactionsRow, addBtn);
        } else {
            bubble.appendChild(reactionsRow);
        }
    }
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
    if (status === 'sending') {
        return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6" stroke-dasharray="28" stroke-dashoffset="8" class="tick-spinner"/></svg>`;
    }
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

function _lastRenderedTime(container) {
    let node = container.lastChild;
    while (node) {
        if (node.dataset?.msgId) {
            const msg = window.appState.messages.find(m => m.id == node.dataset.msgId);
            return msg?.created_at ?? null;
        }
        node = node.previousSibling;
    }
    return null;
}

// ─────────────────────────────────────────
// FORWARD MESSAGE
// ─────────────────────────────────────────
let _forwardMsgId = null;

function _showForwardModal(messageId) {
    _forwardMsgId = messageId;
    const modal = document.getElementById('forwardModal');
    const list = document.getElementById('forwardConvList');
    if (!modal || !list) return;

    const convs = (window.appState.conversations || [])
        .filter(c => c.conversation_id !== window.appState.activeConversationId);

    _renderForwardList(convs);
    modal.style.display = 'flex';

    document.getElementById('forwardSearchInput').value = '';
    document.getElementById('forwardSearchInput').focus();
}

function _renderForwardList(convs) {
    const list = document.getElementById('forwardConvList');
    if (!list) return;
    list.innerHTML = '';

    if (!convs.length) {
        list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--color-text-tertiary);font-size:13px;">No conversations to forward to</div>';
        return;
    }

    const frag = document.createDocumentFragment();
    convs.forEach(conv => {
        const user = conv.other_user;
        const name = conv.type === 'group' ? (conv.name || 'Group') : (user?.display_name || 'Unknown');
        const item = document.createElement('div');
        item.className = 'forward-conversation-item';
        item.innerHTML = `
            <div class="avatar avatar--sm">${createAvatar(user || { display_name: name }, 'avatar--sm')}</div>
            <span style="font-size:14px;font-weight:500;">${escapeHTML(name)}</span>`;
        item.addEventListener('click', () => _doForward(conv.conversation_id));
        frag.appendChild(item);
    });
    list.appendChild(frag);
}

async function _doForward(targetConvId) {
    if (!_forwardMsgId) return;
    const modal = document.getElementById('forwardModal');
    if (modal) modal.style.display = 'none';

    try {
        const res = await api('/chat/forward', {
            method: 'POST',
            body: { message_id: _forwardMsgId, target_conversation_id: targetConvId }
        });
        if (res?.success) {
            showToast('Message forwarded', 'success');
        } else {
            showToast(res?.error || 'Failed to forward', 'error');
        }
    } catch (e) {
        showToast('Failed to forward message', 'error');
    }
    _forwardMsgId = null;
}

// Forward modal event bindings
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('forwardCancelBtn')?.addEventListener('click', () => {
        const modal = document.getElementById('forwardModal');
        if (modal) modal.style.display = 'none';
        _forwardMsgId = null;
    });

    document.getElementById('forwardSearchInput')?.addEventListener('input', function () {
        const q = this.value.toLowerCase().trim();
        const convs = (window.appState.conversations || [])
            .filter(c => c.conversation_id !== window.appState.activeConversationId)
            .filter(c => {
                if (!q) return true;
                const name = c.type === 'group' ? (c.name || '') : (c.other_user?.display_name || '');
                return name.toLowerCase().includes(q);
            });
        _renderForwardList(convs);
    });
});
