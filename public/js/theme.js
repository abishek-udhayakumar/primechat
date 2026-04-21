/**
 * PrimeChat — Profile & Theme Management
 */

window.initProfile = () => {
    // Open Profile
    document.getElementById('sidebarProfileTrigger')?.addEventListener('click', () => {
        document.getElementById('profilePanel').classList.add('show');
        populateProfileData();
    });
    
    // Close Profile
    document.getElementById('closeProfileBtn')?.addEventListener('click', () => {
        document.getElementById('profilePanel').classList.remove('show');
    });
    
    // Theme Toggle (Header)
    document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);
    
    // Theme Toggle (Profile Panel)
    document.getElementById('profileThemeToggle')?.addEventListener('click', toggleTheme);
    
    // Avatar Upload
    const avatarWrapper = document.getElementById('profileAvatarWrapper');
    const avatarInput = document.getElementById('avatarInput');
    
    if (avatarWrapper && avatarInput) {
        avatarWrapper.addEventListener('click', () => {
            avatarInput.click();
        });
        
        avatarInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                if (file.size > 2 * 1024 * 1024) {
                    showToast('Avatar must be less than 2MB', 'error');
                    return;
                }
                
                const formData = new FormData();
                formData.append('avatar', file);
                
                try {
                    const res = await api('/auth/profile', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (res && res.success) {
                        window.appState.user = res.data.user;
                        localStorage.setItem('user', JSON.stringify(res.data.user));
                        
                        // Update UI
                        document.getElementById('currentUserAvatar').innerHTML = createAvatar(res.data.user);
                        document.getElementById('profileAvatar').innerHTML = createAvatar(res.data.user, 'avatar--xl');
                        
                        showToast('Avatar updated', 'success');
                    }
                } catch (err) {
                    showToast('Failed to update avatar', 'error');
                }
            }
        });
    }
    
    // Wallpaper Selection
    const wallpapers = document.querySelectorAll('.wallpaper-option');
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
                    
                    // Apply to chat view immediately
                    const messagesContainer = document.getElementById('messagesContainer');
                    if (messagesContainer) {
                        messagesContainer.className = `messages-container wallpaper-${bg}`;
                    }
                    
                    showToast('Wallpaper updated', 'success');
                }
            } catch (err) {
                showToast('Failed to update wallpaper', 'error');
            }
        });
    });
};

function populateProfileData() {
    const user = window.appState.user;
    if (!user) return;
    
    document.getElementById('profileAvatar').innerHTML = createAvatar(user, 'avatar--xl');
    document.getElementById('profileDisplayName').textContent = user.display_name;
    document.getElementById('profileAbout').textContent = user.about || 'Available';
    
    // Set active wallpaper
    const wallpapers = document.querySelectorAll('.wallpaper-option');
    wallpapers.forEach(wp => {
        wp.classList.remove('active');
        if (wp.dataset.bg === user.wallpaper) {
            wp.classList.add('active');
        }
    });
}

async function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // Update DOM
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Save to server
    if (window.appState.user) {
        try {
            window.appState.user.theme = newTheme;
            localStorage.setItem('user', JSON.stringify(window.appState.user));
            
            api('/auth/profile', {
                method: 'POST',
                body: { theme: newTheme }
            }).catch(e => console.error('Failed to save theme preference', e));
        } catch (e) {}
    }
}
