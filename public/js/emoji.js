/**
 * PrimeChat — Emoji Picker (Unified)
 *
 * Lazy-loaded by app.js — must export window.initEmoji()
 */

'use strict';

const EMOJIS = {
    smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '👽', '👾', '🤖'],
    gestures: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟']
};

let _emojiInitialized = false;

window.initEmoji = () => {
    if (_emojiInitialized) return;
    _emojiInitialized = true;

    const emojiBtn = document.getElementById('emojiBtn');
    const picker = document.getElementById('emojiPicker');

    if (!emojiBtn || !picker) return;

    // Build Picker HTML
    let html = `
        <div class="emoji-picker-header">
            <input type="text" class="emoji-search" id="emojiSearch" placeholder="Search emoji...">
        </div>
        <div class="emoji-categories">
            <div class="emoji-category-btn active" data-cat="all">😀</div>
            <div class="emoji-category-btn" data-cat="gestures">👍</div>
            <div class="emoji-category-btn" data-cat="hearts">❤️</div>
        </div>
        <div class="emoji-grid" id="emojiGrid">
    `;

    for (const [cat, emojis] of Object.entries(EMOJIS)) {
        html += `<div class="emoji-category-label">${cat}</div>`;
        emojis.forEach(e => {
            html += `<div class="emoji-item">${e}</div>`;
        });
    }

    html += `</div>`;
    picker.innerHTML = html;

    // Toggle Picker
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        picker.classList.toggle('show');
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!picker.contains(e.target) && e.target !== emojiBtn && !emojiBtn.contains(e.target)) {
            picker.classList.remove('show');
        }
    });

    // Emoji click — insert at cursor position
    picker.addEventListener('click', (e) => {
        if (e.target.classList.contains('emoji-item')) {
            const input = document.getElementById('messageInput');
            const emoji = e.target.textContent;

            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = input.value;

            input.value = text.substring(0, start) + emoji + text.substring(end);
            input.selectionStart = input.selectionEnd = start + emoji.length;
            input.focus();

            // Trigger input event to resize textarea and show send btn
            input.dispatchEvent(new Event('input'));
        }
    });
};

