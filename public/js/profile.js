/**
 * PrimeChat — Profile Editor
 * contenteditable inline edit: click pencil → text becomes editable
 */

document.addEventListener('DOMContentLoaded', () => {

    // ── Avatar Upload ──────────────────────────────────
    const avatarWrapper = document.getElementById('profileAvatarWrapper');
    const avatarInput   = document.getElementById('avatarInput');

    if (avatarWrapper && avatarInput) {
        avatarWrapper.addEventListener('click', () => avatarInput.click());

        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !file.type.startsWith('image/')) return;

            avatarWrapper.classList.add('uploading');
            const avatarEl = document.getElementById('profileAvatar');
            const backup   = avatarEl.innerHTML;
            avatarEl.innerHTML = '<div class="spinner spinner--sm" style="margin:auto"></div>';

            try {
                const fd = new FormData();
                fd.append('avatar', file);
                const res = await api('/auth/update_profile.php', { method: 'POST', body: fd });
                if (res.success) {
                    showToast('Photo updated!', 'success');
                    window.appState.currentUser = res.data.user;
                    window.dispatchEvent(new CustomEvent('appStateChanged', { detail: { type: 'currentUser' } }));
                }
            } catch (err) {
                showToast('Photo update failed', 'error');
                avatarEl.innerHTML = backup;
            } finally {
                avatarWrapper.classList.remove('uploading');
                avatarInput.value = '';
            }
        });
    }

    // ── Inline contenteditable edit ────────────────────
    const fields = {
        DisplayName: { valueId: 'profileDisplayName', apiKey: 'display_name', placeholder: 'Your name', required: true },
        About:       { valueId: 'profileAbout',       apiKey: 'about',         placeholder: 'Hey there!', required: false }
    };

    document.querySelectorAll('.edit-field-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = btn.dataset.target;
            startEdit(target, btn);
        });
    });

    function startEdit(target, pencilBtn) {
        const cfg      = fields[target];
        const valueEl  = document.getElementById(cfg.valueId);
        const fieldEl  = document.getElementById(`profile${target}Field`);

        // Already editing
        if (valueEl.contentEditable === 'true') return;

        const original = valueEl.textContent.trim();

        // Make the text editable in-place
        valueEl.contentEditable = 'true';
        valueEl.dataset.original = original;
        fieldEl.classList.add('editing');

        // Focus & move cursor to end
        valueEl.focus();
        const range = document.createRange();
        range.selectNodeContents(valueEl);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // Swap pencil → tick + X
        pencilBtn.style.display = 'none';

        const actions = document.createElement('div');
        actions.className = 'inline-actions';
        actions.innerHTML = `
            <button class="btn btn--icon save-field-btn" title="Save" data-target="${target}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="btn btn--icon cancel-field-btn" title="Cancel" data-target="${target}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`;
        pencilBtn.parentNode.appendChild(actions);

        actions.querySelector('.save-field-btn').addEventListener('click', () => saveEdit(target, pencilBtn, actions));
        actions.querySelector('.cancel-field-btn').addEventListener('click', () => cancelEdit(target, pencilBtn, actions));

        // Enter = save, Escape = cancel
        valueEl.addEventListener('keydown', function handler(e) {
            if (e.key === 'Enter') { e.preventDefault(); saveEdit(target, pencilBtn, actions); valueEl.removeEventListener('keydown', handler); }
            if (e.key === 'Escape') { cancelEdit(target, pencilBtn, actions); valueEl.removeEventListener('keydown', handler); }
        });
    }

    async function saveEdit(target, pencilBtn, actions) {
        const cfg     = fields[target];
        const valueEl = document.getElementById(cfg.valueId);
        const fieldEl = document.getElementById(`profile${target}Field`);
        const newVal  = valueEl.textContent.trim();

        if (cfg.required && !newVal) {
            showToast('Name cannot be empty', 'error');
            valueEl.focus();
            return;
        }

        // Spinner on save button
        const saveBtn = actions.querySelector('.save-field-btn');
        saveBtn.innerHTML = '<div class="spinner spinner--sm"></div>';
        saveBtn.disabled = true;

        const fd = new FormData();
        fd.append(cfg.apiKey, newVal);

        try {
            const res = await api('/auth/update_profile.php', { method: 'POST', body: fd });
            if (res.success) {
                showToast('Saved!', 'success');
                window.appState.currentUser = res.data.user;
                window.dispatchEvent(new CustomEvent('appStateChanged', { detail: { type: 'currentUser' } }));
            }
        } catch (err) {
            showToast(`Save failed: ${err.message}`, 'error');
            valueEl.textContent = valueEl.dataset.original;
        } finally {
            stopEdit(valueEl, fieldEl, pencilBtn, actions);
        }
    }

    function cancelEdit(target, pencilBtn, actions) {
        const cfg     = fields[target];
        const valueEl = document.getElementById(cfg.valueId);
        const fieldEl = document.getElementById(`profile${target}Field`);
        valueEl.textContent = valueEl.dataset.original;
        stopEdit(valueEl, fieldEl, pencilBtn, actions);
    }

    function stopEdit(valueEl, fieldEl, pencilBtn, actions) {
        valueEl.contentEditable = 'false';
        fieldEl.classList.remove('editing');
        pencilBtn.style.display = '';
        actions.remove();
    }
});
