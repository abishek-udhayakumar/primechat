/**
 * PrimeChat — Profile Editor & Settings Panel
 */

'use strict';

let _profileInitialized = false;

window.initProfile = () => {
    if (_profileInitialized) return;
    _profileInitialized = true;

    const profilePanel = document.getElementById('profilePanel');
    const closeBtn = document.getElementById('closeProfileBtn');
    const avatarWrapper = document.getElementById('profileAvatarWrapper');
    const avatarInput = document.getElementById('avatarInput');
    const themeToggle = document.getElementById('profileThemeToggle');
    const wallpapers = document.querySelectorAll('.wallpaper-option');

    // ── Open / Populate Profile Panel ──
    const openProfile = () => {
        profilePanel.classList.add('show');
        populateProfileData();
    };
    
    // Bind open to trigger
    document.getElementById('sidebarProfileTrigger')?.addEventListener('click', openProfile);
    
    // ── Close Profile ──
    closeBtn?.addEventListener('click', () => {
        profilePanel.classList.remove('show');
    });

    // ── Theme Toggle (inside Profile) ──
    themeToggle?.addEventListener('click', async () => {
        if (!window.toggleTheme) {
            await _loadModule('/js/theme.js');
        }
        if (window.toggleTheme) {
            await window.toggleTheme();
        }
    });

    // ── Avatar Upload ──
    if (avatarWrapper && avatarInput) {
        avatarWrapper.addEventListener('click', () => avatarInput.click());

        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !file.type.startsWith('image/')) return;
            if (file.size > 2 * 1024 * 1024) {
                showToast('Avatar must be less than 2MB', 'error');
                return;
            }

            avatarWrapper.classList.add('uploading');
            const avatarEl = document.getElementById('profileAvatar');
            const backupHTML = avatarEl.innerHTML;
            avatarEl.innerHTML = '<div class="spinner spinner--sm mx-auto"></div>';

            const formData = new FormData();
            formData.append('avatar', file);

            try {
                const res = await api('/auth/update_profile.php', { method: 'POST', body: formData });
                if (res && res.success) {
                    window.appState.user = res.data.user;
                    localStorage.setItem('user', JSON.stringify(res.data.user));
                    
                    // Update all avatar nodes in layout
                    const headerAvatar = document.getElementById('currentUserAvatar');
                    const profileAvatar = document.getElementById('profileAvatar');
                    if (headerAvatar) headerAvatar.innerHTML = createAvatar(res.data.user);
                    if (profileAvatar) profileAvatar.innerHTML = createAvatar(res.data.user, 'avatar--xl');

                    showToast('Avatar photo updated successfully', 'success');
                }
            } catch (err) {
                showToast('Failed to update avatar photo', 'error');
                avatarEl.innerHTML = backupHTML;
            } finally {
                avatarWrapper.classList.remove('uploading');
                avatarInput.value = '';
            }
        });
    }

    // ── Wallpaper Selection ──
    wallpapers.forEach(wp => {
        wp.addEventListener('click', async () => {
            wallpapers.forEach(w => w.classList.remove('active'));
            wp.classList.add('active');
            const bg = wp.dataset.bg;
            
            try {
                const res = await api('/settings/wallpaper', {
                    method: 'POST',
                    body: { wallpaper: bg }
                });
                
                if (res && res.success) {
                    window.appState.user.wallpaper = bg;
                    localStorage.setItem('user', JSON.stringify(window.appState.user));
                    
                    // Apply to chat view instantly
                    const messagesContainer = document.getElementById('messagesContainer');
                    if (messagesContainer) {
                        messagesContainer.className = `messages-container wallpaper-${bg}`;
                    }
                    showToast('Wallpaper style updated', 'success');
                }
            } catch (err) {
                showToast('Failed to update wallpaper', 'error');
            }
        });
    });

    // ── Inline contenteditable Fields ──
    const fieldConfigs = {
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
        const cfg = fieldConfigs[target];
        const valueEl = document.getElementById(cfg.valueId);
        const fieldEl = document.getElementById(`profile${target}Field`);

        if (valueEl.contentEditable === 'true') return;

        const originalText = valueEl.textContent.trim();
        valueEl.contentEditable = 'true';
        valueEl.dataset.original = originalText;
        fieldEl.classList.add('editing');
        valueEl.focus();

        // Cursor at the end of content editable text
        const range = document.createRange();
        range.selectNodeContents(valueEl);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        pencilBtn.style.display = 'none';

        const actions = document.createElement('div');
        actions.className = 'inline-actions ml-2 flex items-center gap-1';
        actions.innerHTML = `
            <button class="btn btn--icon save-field-btn text-green-500" title="Save" data-target="${target}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="btn btn--icon cancel-field-btn text-red-500" title="Cancel" data-target="${target}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`;
        pencilBtn.parentNode.appendChild(actions);

        actions.querySelector('.save-field-btn').addEventListener('click', () => saveEdit(target, pencilBtn, actions));
        actions.querySelector('.cancel-field-btn').addEventListener('click', () => cancelEdit(target, pencilBtn, actions));

        // Keydown controls
        const keyHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit(target, pencilBtn, actions);
                valueEl.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'Escape') {
                cancelEdit(target, pencilBtn, actions);
                valueEl.removeEventListener('keydown', keyHandler);
            }
        };
        valueEl.addEventListener('keydown', keyHandler);
    }

    async function saveEdit(target, pencilBtn, actions) {
        const cfg = fieldConfigs[target];
        const valueEl = document.getElementById(cfg.valueId);
        const fieldEl = document.getElementById(`profile${target}Field`);
        const newVal = valueEl.textContent.trim();

        if (cfg.required && !newVal) {
            showToast('Field cannot be left empty', 'error');
            valueEl.focus();
            return;
        }

        const saveBtn = actions.querySelector('.save-field-btn');
        saveBtn.innerHTML = '<div class="spinner spinner--sm"></div>';
        saveBtn.disabled = true;

        const formData = new FormData();
        formData.append(cfg.apiKey, newVal);

        try {
            const res = await api('/auth/update_profile.php', { method: 'POST', body: formData });
            if (res && res.success) {
                window.appState.user = res.data.user;
                localStorage.setItem('user', JSON.stringify(res.data.user));
                
                // Update header names if displaying
                const headerName = document.getElementById('currentUserName');
                if (headerName && target === 'DisplayName') {
                    headerName.textContent = res.data.user.display_name;
                }
                showToast('Field saved successfully', 'success');
            }
        } catch (err) {
            showToast(`Save failed: ${err.message}`, 'error');
            valueEl.textContent = valueEl.dataset.original;
        } finally {
            stopEdit(valueEl, fieldEl, pencilBtn, actions);
        }
    }

    function cancelEdit(target, pencilBtn, actions) {
        const cfg = fieldConfigs[target];
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
};

function populateProfileData() {
    const user = window.appState.user;
    if (!user) return;
    
    const profileAvatar = document.getElementById('profileAvatar');
    const profileDisplayName = document.getElementById('profileDisplayName');
    const profileAbout = document.getElementById('profileAbout');

    if (profileAvatar) profileAvatar.innerHTML = createAvatar(user, 'avatar--xl');
    if (profileDisplayName) profileDisplayName.textContent = user.display_name;
    if (profileAbout) profileAbout.textContent = user.about || 'Available';
    
    // Set active wallpaper
    const wallpapers = document.querySelectorAll('.wallpaper-option');
    wallpapers.forEach(wp => {
        wp.classList.remove('active');
        if (wp.dataset.bg === user.wallpaper) {
            wp.classList.add('active');
        }
    });
}
