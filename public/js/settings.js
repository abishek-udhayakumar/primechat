/**
 * PrimeChat — Settings Engine
 * Premium redesign with full accessibility, error handling, and dark mode support
 */

'use strict';

window.SettingsEngine = (() => {
    let _initialized = false;
    let _state = {
        currentView: 'settingsRootView',
        viewStack: [],
    };

    const DOM = {};
    let _cache = { blockedCount: null };

    const PREF_TOGGLES = {
        prefNotifyMessages: 'notify_messages',
        prefNotifyPreview: 'notify_preview',
        prefNotifyDesktop: 'notify_desktop',
        prefReadReceipts: 'read_receipts',
        prefEnterSend: 'enter_send',
        prefKeepArchived: 'keep_archived',
        prefA11yMotion: 'a11y_motion',
        prefA11yContrast: 'a11y_contrast',
    };

    const PREF_SELECTS = {
        prefPrivacyLastSeen: 'privacy_last_seen',
        prefPrivacyPhoto: 'privacy_photo',
        prefMediaQuality: 'media_quality',
        prefFontSize: 'font_size',
        prefNotifySound: 'notify_sound',
        prefAutoDLCell: 'auto_dl_cell',
        prefAutoDLWifi: 'auto_dl_wifi',
    };

    const PREF_DEFAULTS = {
        enter_send: true,
        keep_archived: true,
        notify_messages: true,
        notify_preview: true,
        notify_desktop: false,
        read_receipts: true,
        a11y_motion: false,
        a11y_contrast: false,
        privacy_last_seen: 'everyone',
        privacy_photo: 'everyone',
        media_quality: 'auto',
        font_size: 'medium',
        notify_sound: 'default',
        auto_dl_cell: 'photos',
        auto_dl_wifi: 'all',
    };

    function cacheDOM() {
        DOM.panel = document.getElementById('settingsPanel');
        DOM.closeBtn = document.getElementById('closeSettingsBtn');
        DOM.rootView = document.getElementById('settingsRootView');
        DOM.contentArea = document.getElementById('settingsContentArea');
    }

    function init() {
        if (_initialized) return;
        cacheDOM();
        if (!DOM.panel) return;
        bindEvents();
        _initialized = true;
    }

    function bindEvents() {
        DOM.closeBtn?.addEventListener('click', closeSettings);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && _state.isOpen) {
                if (_state.viewStack.length > 0) {
                    navigateBack();
                } else {
                    closeSettings();
                }
            }
        });

        DOM.panel?.addEventListener('click', (e) => {
            const navItem = e.target.closest('[data-navigate]');
            if (navItem) {
                const view = navItem.dataset.navigate;
                navigateTo(view);
                return;
            }
            const backBtn = e.target.closest('.settings-back-btn');
            if (backBtn) {
                navigateBack();
                return;
            }
            const logoutBtn = e.target.closest('#settingsLogoutBtn, [data-action="logout"]');
            if (logoutBtn) {
                handleLogout();
                return;
            }
            const deleteBtn = e.target.closest('#btnDeleteAccount, [data-action="delete-account"]');
            if (deleteBtn) {
                handleDeleteAccount();
                return;
            }
            const exportBtn = e.target.closest('#btnExportData, [data-action="export-data"]');
            if (exportBtn) {
                handleExportData();
                return;
            }
            const clearCacheBtn = e.target.closest('#btnClearCache, [data-action="clear-cache"]');
            if (clearCacheBtn) {
                handleClearCache();
                return;
            }
            const manageBlockedBtn = e.target.closest('#btnManageBlocked, [data-action="manage-blocked"]');
            if (manageBlockedBtn) {
                showBlockedContacts();
                return;
            }
            const twoFABtn = e.target.closest('#btn2FA, [data-action="2fa"]');
            if (twoFABtn) {
                handle2FA();
                return;
            }
            const changePwdBtn = e.target.closest('#btnChangePassword, [data-action="change-password"]');
            if (changePwdBtn) {
                handleChangePassword();
                return;
            }
        });

        DOM.panel?.addEventListener('change', (e) => {
            const toggle = e.target.closest('[data-pref-toggle]');
            if (toggle) {
                const key = toggle.dataset.prefToggle;
                updatePreference(key, toggle.checked);
                return;
            }
            const select = e.target.closest('[data-pref-select]');
            if (select) {
                const key = select.dataset.prefSelect;
                updatePreference(key, select.value);
                return;
            }
            const avatarInput = e.target.closest('#avatarInput');
            if (avatarInput) {
                handleAvatarUpload(avatarInput);
                return;
            }
        });

        DOM.panel?.addEventListener('click', (e) => {
            const themeBtn = e.target.closest('#profileThemeToggle, [data-action="toggle-theme"]');
            if (themeBtn) {
                toggleThemeHandler();
                return;
            }
            const wallpaperBtn = e.target.closest('.wallpaper-btn');
            if (wallpaperBtn) {
                selectWallpaper(wallpaperBtn);
                return;
            }
            const editBtn = e.target.closest('.edit-field-btn');
            if (editBtn) {
                startInlineEdit(editBtn);
                return;
            }
            const saveBtn = e.target.closest('.inline-edit-save');
            if (saveBtn) {
                saveInlineEdit(saveBtn);
                return;
            }
            const cancelBtn = e.target.closest('.inline-edit-cancel');
            if (cancelBtn) {
                cancelInlineEdit(cancelBtn);
                return;
            }
            const logoutDeviceBtn = e.target.closest('[data-action="logout-device"]');
            if (logoutDeviceBtn) {
                const sessionId = logoutDeviceBtn.dataset.sessionId;
                handleLogoutDevice(sessionId);
                return;
            }
        });
    }

    function openSettings() {
        _state.isOpen = true;
        DOM.panel.classList.remove('translate-x-full');
        DOM.panel.classList.add('translate-x-0');
        populateData();
        navigateTo('settingsRootView');
        document.body.style.overflow = 'hidden';
    }

    function closeSettings() {
        _state.isOpen = false;
        DOM.panel.classList.remove('translate-x-0');
        DOM.panel.classList.add('translate-x-full');
        _state.viewStack = [];
        document.body.style.overflow = '';
    }

    function navigateTo(viewId) {
        if (viewId === 'settingsRootView') {
            _state.viewStack = [];
            showView('settingsRootView');
            return;
        }

        _state.viewStack.push(_state.currentView);
        _state.currentView = viewId;
        showView(viewId);

        if (viewId === 'settingsSecurityView') loadActiveSessions();
        else if (viewId === 'settingsStorageView') calculateStorage();
        else if (viewId === 'settingsPrivacyView') loadBlockedCount();
    }

    function navigateBack() {
        const prev = _state.viewStack.pop();
        if (prev) {
            _state.currentView = prev;
            showView(prev);
        }
    }

    function showView(viewId) {
        const views = DOM.panel.querySelectorAll('.settings-view');
        views.forEach(v => {
            if (v.id === viewId) {
                v.classList.remove('hidden', 'translate-x-full');
                v.classList.add('flex');
            } else if (v.id === 'settingsRootView') {
                v.classList.add('hidden');
                v.classList.remove('flex');
            } else {
                v.classList.add('hidden');
                v.classList.remove('flex');
            }
        });

        DOM.panel.querySelectorAll('.settings-view-header-title').forEach(el => {
            const view = el.closest('.settings-view');
            if (view && view.id === viewId) {
                el.textContent = view.dataset.title || 'Settings';
            }
        });
    }

    function getPrefs() {
        const user = window.appState?.user;
        return { ...PREF_DEFAULTS, ...(user?.preferences || {}) };
    }

    function getUser() {
        return window.appState?.user || {};
    }

    function populateData() {
        const user = getUser();
        if (!user || !user.id) return;

        const rootName = document.getElementById('settingsRootName');
        const rootAbout = document.getElementById('settingsRootAbout');
        const rootAvatar = document.getElementById('settingsRootAvatar');
        if (rootName) rootName.textContent = user.display_name || user.username || 'User';
        if (rootAbout) rootAbout.textContent = user.about || 'Hey there! I am using PrimeChat';
        if (rootAvatar) rootAvatar.innerHTML = createAvatar(user, 'avatar--lg');

        const profileAvatar = document.getElementById('profileAvatar');
        if (profileAvatar) profileAvatar.innerHTML = createAvatar(user, 'avatar--xl');
        const profileName = document.getElementById('profileDisplayName');
        if (profileName) profileName.textContent = user.display_name || '';
        const profileAbout = document.getElementById('profileAbout');
        if (profileAbout) profileAbout.textContent = user.about || '';

        const themeLabel = document.getElementById('currentThemeLabel');
        if (themeLabel) themeLabel.textContent = user.theme === 'dark' ? 'Dark' : 'Light';

        const prefs = getPrefs();
        for (const [id, key] of Object.entries(PREF_TOGGLES)) {
            const el = document.getElementById(id);
            if (el) el.checked = prefs[key] ?? PREF_DEFAULTS[key];
        }
        for (const [id, key] of Object.entries(PREF_SELECTS)) {
            const el = document.getElementById(id);
            if (el) el.value = prefs[key] ?? PREF_DEFAULTS[key];
        }

        DOM.panel.querySelectorAll('.wallpaper-btn').forEach(btn => {
            btn.classList.toggle('ring-2', btn.dataset.bg === user.wallpaper);
            btn.classList.toggle('ring-prime', btn.dataset.bg === user.wallpaper);
        });
    }

    async function updatePreference(key, value) {
        const user = getUser();
        if (!user || !user.id) return;

        user.preferences = user.preferences || {};
        user.preferences[key] = value;
        window.appState.user = user;
        localStorage.setItem('user', JSON.stringify(user));

        try {
            const res = await api('/settings/update.php', {
                method: 'POST',
                body: { preferences: { [key]: value } },
            });
            if (res?.data?.user) {
                window.appState.user = res.data.user;
                localStorage.setItem('user', JSON.stringify(res.data.user));
            }
        } catch (e) {
            showToast('Failed to save setting', 'error');
        }
    }

    async function toggleThemeHandler() {
        if (!window.toggleTheme) {
            try { await _loadModule('/js/theme.js'); } catch (_) {}
        }
        if (window.toggleTheme) {
            await window.toggleTheme();
            const label = document.getElementById('currentThemeLabel');
            if (label) label.textContent = window.appState?.user?.theme === 'dark' ? 'Dark' : 'Light';
        }
    }

    async function selectWallpaper(btn) {
        const bg = btn.dataset.bg;
        DOM.panel.querySelectorAll('.wallpaper-btn').forEach(b => {
            b.classList.remove('ring-2', 'ring-prime');
        });
        btn.classList.add('ring-2', 'ring-prime');

        try {
            const res = await api('/settings/wallpaper', { method: 'POST', body: { wallpaper: bg } });
            if (res?.success) {
                const user = getUser();
                user.wallpaper = bg;
                window.appState.user = user;
                localStorage.setItem('user', JSON.stringify(user));
                const msgs = document.getElementById('messagesContainer');
                if (msgs) msgs.className = `messages-container wallpaper-${bg}`;
                showToast('Wallpaper updated', 'success');
            }
        } catch (_) {
            showToast('Failed to update wallpaper', 'error');
        }
    }

    function startInlineEdit(btn) {
        const target = btn.dataset.target;
        const field = target === 'DisplayName' ? 'display_name' : 'about';
        const valueEl = document.getElementById(`profile${target}`);
        if (!valueEl || valueEl.dataset.editing === 'true') return;

        const row = btn.closest('.inline-edit-row') || btn.parentElement;
        const original = valueEl.textContent.trim();
        valueEl.contentEditable = 'true';
        valueEl.dataset.editing = 'true';
        valueEl.dataset.original = original;
        valueEl.focus();
        btn.classList.add('hidden');

        const actions = document.createElement('div');
        actions.className = 'inline-edit-actions flex items-center gap-1.5 ml-auto';
        actions.innerHTML = `
            <button class="inline-edit-save p-1.5 rounded-lg text-emerald hover:bg-emerald-light transition-colors" data-target="${target}">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="inline-edit-cancel p-1.5 rounded-lg text-crimson hover:bg-crimson-light transition-colors" data-target="${target}">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`;
        row.appendChild(actions);
    }

    async function saveInlineEdit(saveBtn) {
        const target = saveBtn.dataset.target;
        const field = target === 'DisplayName' ? 'display_name' : 'about';
        const valueEl = document.getElementById(`profile${target}`);
        if (!valueEl) return;

        const newVal = valueEl.textContent.trim();
        if (!newVal) { showToast('Value cannot be empty', 'error'); return; }

        try {
            const res = await api('/auth/update_profile.php', {
                method: 'POST',
                body: { [field]: newVal },
            });
            if (res?.success && res?.data?.user) {
                window.appState.user = res.data.user;
                localStorage.setItem('user', JSON.stringify(res.data.user));
                populateData();
                showToast(`${target} updated`, 'success');
            }
        } catch (_) {
            valueEl.textContent = valueEl.dataset.original || newVal;
            showToast(`Failed to update ${target}`, 'error');
        }
        endInlineEdit(valueEl, saveBtn);
    }

    function cancelInlineEdit(cancelBtn) {
        const target = cancelBtn.dataset.target;
        const valueEl = document.getElementById(`profile${target}`);
        if (!valueEl) return;
        valueEl.textContent = valueEl.dataset.original || valueEl.textContent;
        endInlineEdit(valueEl, cancelBtn);
    }

    function endInlineEdit(valueEl, btn) {
        valueEl.contentEditable = 'false';
        valueEl.dataset.editing = 'false';
        delete valueEl.dataset.original;
        const row = valueEl.closest('.inline-edit-row') || valueEl.parentElement;
        row.querySelector('.edit-field-btn')?.classList.remove('hidden');
        row.querySelector('.inline-edit-actions')?.remove();
    }

    async function handleAvatarUpload(input) {
        const file = input.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('avatar', file);
        try {
            const res = await api('/auth/update_profile', { method: 'POST', body: formData });
            if (res?.success && res?.data?.user) {
                window.appState.user = res.data.user;
                localStorage.setItem('user', JSON.stringify(res.data.user));
                populateData();
                const headerAvatar = document.getElementById('currentUserAvatar');
                if (headerAvatar) headerAvatar.innerHTML = createAvatar(res.data.user);
                showToast('Profile photo updated', 'success');
            }
        } catch (_) {
            showToast('Failed to update profile photo', 'error');
        }
        input.value = '';
    }

    function handleExportData() {
        window.open('/api/account/export.php', '_blank');
        showToast('Data export started', 'info');
    }

    async function handleDeleteAccount() {
        if (!confirm('WARNING: This will permanently delete your account and all data. This action cannot be undone. Are you sure?')) return;
        const pwd = prompt('Enter your password to confirm account deletion:');
        if (!pwd) return;
        try {
            const res = await api('/api/account/delete.php', { method: 'POST', body: { password: pwd } });
            if (res?.success) {
                showToast('Account deleted', 'success');
                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (err) {
            showToast('Failed to delete account: ' + (err.message || 'Unknown error'), 'error');
        }
    }

    async function handleLogout() {
        if (!confirm('Are you sure you want to sign out?')) return;
        try {
            await api('/auth/logout', { method: 'POST' });
        } catch (_) {}
        localStorage.removeItem('user');
        localStorage.removeItem('csrf_token');
        window.location.reload();
    }

    async function loadActiveSessions() {
        const container = document.getElementById('activeSessionsList');
        if (!container) return;

        container.innerHTML = `
            <div class="flex items-center justify-center py-8 text-ink-faint">
                <svg class="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4"/></svg>
                Loading sessions...
            </div>`;

        try {
            const res = await api('/api/security/sessions.php');
            if (!res?.success || !res?.data?.sessions?.length) {
                container.innerHTML = '<div class="flex items-center justify-center py-8 text-ink-faint text-sm">No active sessions found</div>';
                return;
            }

            container.innerHTML = '';
            res.data.sessions.forEach(sess => {
                const isCurrent = parseInt(sess.is_current) === 1;
                const date = sess.last_active ? new Date(sess.last_active).toLocaleString() : 'Unknown';
                const ua = sess.user_agent || 'Unknown device';
                const ip = sess.ip_address || 'Unknown IP';
                const deviceName = ua.length > 40 ? ua.substring(0, 40) + '…' : ua;

                const div = document.createElement('div');
                div.className = 'flex items-center gap-4 px-5 py-4 border-b border-edge';
                div.innerHTML = `
                    <div class="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
                        <svg class="w-5 h-5 text-ink-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/></svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-ink flex items-center gap-2">
                            ${escapeHTML(deviceName)}
                            ${isCurrent ? '<span class="text-2xs font-semibold uppercase tracking-wider bg-emerald/10 text-emerald px-1.5 py-0.5 rounded">Current</span>' : ''}
                        </div>
                        <div class="text-xs text-ink-faint mt-0.5">Last active: ${escapeHTML(date)}</div>
                        <div class="text-xs text-ink-faint">${escapeHTML(ip)}</div>
                    </div>
                    ${!isCurrent ? `<button class="shrink-0 text-xs font-medium text-crimson hover:text-crimson/80 transition-colors px-2 py-1 rounded-lg hover:bg-crimson-light" data-action="logout-device" data-session-id="${sess.id}">Logout</button>` : ''}
                `;
                container.appendChild(div);
            });
        } catch (_) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 text-ink-faint">
                    <svg class="w-8 h-8 mb-2 text-crimson" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <div class="text-sm">Failed to load sessions</div>
                    <button class="mt-2 text-xs text-prime hover:underline" onclick="SettingsEngine.loadActiveSessions()">Retry</button>
                </div>`;
        }
    }

    async function handleLogoutDevice(sessionId) {
        if (!confirm('Log out this device?')) return;
        try {
            const res = await api('/api/security/logout_device.php', {
                method: 'POST',
                body: { session_id_db: parseInt(sessionId) },
            });
            if (res?.success) {
                showToast('Device logged out', 'success');
                loadActiveSessions();
            }
        } catch (_) {
            showToast('Failed to log out device', 'error');
        }
    }

    async function handle2FA() {
        try {
            const res = await api('/auth/2fa/status');
            if (res?.success) {
                const enabled = res.data?.enabled;
                if (enabled) {
                    if (!confirm('Disable two-step verification? You will no longer need a code to log in.')) return;
                    const disableRes = await api('/auth/2fa/disable', { method: 'POST' });
                    if (disableRes?.success) {
                        showToast('Two-step verification disabled', 'success');
                    }
                } else {
                    const setupRes = await api('/auth/2fa/setup', { method: 'POST' });
                    if (setupRes?.success && setupRes?.data?.secret) {
                        const code = prompt('Your 2FA secret: ' + setupRes.data.secret + '\n\nEnter the code from your authenticator app to confirm:');
                        if (!code) return;
                        const confirmRes = await api('/auth/2fa/confirm', { method: 'POST', body: { code, secret: setupRes.data.secret } });
                        if (confirmRes?.success) {
                            showToast('Two-step verification enabled', 'success');
                        } else {
                            showToast('Failed to verify code', 'error');
                        }
                    }
                }
            }
        } catch (_) {
            showToast('Failed to load 2FA status', 'error');
        }
    }

    async function handleChangePassword() {
        const current = prompt('Enter your current password:');
        if (!current) return;
        const newPwd = prompt('Enter your new password (min 8 characters):');
        if (!newPwd || newPwd.length < 8) { showToast('Password must be at least 8 characters', 'error'); return; }
        const confirm = prompt('Confirm your new password:');
        if (newPwd !== confirm) { showToast('Passwords do not match', 'error'); return; }

        try {
            const res = await api('/auth/change-password', {
                method: 'POST',
                body: { current_password: current, new_password: newPwd },
            });
            if (res?.success) {
                showToast('Password changed successfully', 'success');
            }
        } catch (err) {
            showToast('Failed to change password: ' + (err.message || 'Unknown error'), 'error');
        }
    }

    async function loadBlockedCount() {
        const label = document.getElementById('blockedCountLabel');
        if (!label) return;
        try {
            const res = await api('/settings/block.php', { method: 'GET' });
            if (res?.success && Array.isArray(res.data?.blocked)) {
                const count = res.data.blocked.length;
                label.textContent = count > 0 ? count.toString() : '0';
                _cache.blockedCount = count;
            }
        } catch (_) {
            label.textContent = '—';
        }
    }

    function showBlockedContacts() {
        showToast('Blocked contacts management coming soon', 'info');
    }

    function calculateStorage() {
        const el = document.getElementById('localStorageUsage');
        if (!el) return;
        let total = 0;
        for (let x in localStorage) {
            if (localStorage.hasOwnProperty(x)) {
                total += (localStorage[x].length * 2);
            }
        }
        const kb = (total / 1024).toFixed(1);
        el.textContent = kb + ' KB used';
    }

    function handleClearCache() {
        if (!confirm('Clear all locally cached data? This will not delete your account or messages on the server.')) return;
        localStorage.clear();
        calculateStorage();
        showToast('Cache cleared', 'success');
    }

    return {
        init,
        openSettings,
        closeSettings,
        navigateTo,
        loadActiveSessions,
        handleLogoutDevice,
        calculateStorage,
    };
})();

document.addEventListener('openSettings', () => {
    window.SettingsEngine?.openSettings();
});
