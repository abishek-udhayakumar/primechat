/**
 * PrimeChat — Theme Management
 */

'use strict';

window.toggleTheme = async function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // Update DOM attribute instantly
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Save to state and server
    if (window.appState && window.appState.user) {
        window.appState.user.theme = newTheme;
        localStorage.setItem('user', JSON.stringify(window.appState.user));
        
        try {
            await api('/auth/profile', {
                method: 'POST',
                body: { theme: newTheme }
            });
        } catch (e) {
            console.error('[PrimeChat] Failed to sync theme with server:', e);
        }
    }
};
