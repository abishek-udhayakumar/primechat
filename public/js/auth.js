/**
 * PrimeChat — Authentication Logic
 * Handles Login and Signup forms
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // Login Form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('loginBtn');
            const spinner = document.getElementById('loginSpinner');
            const btnText = document.getElementById('loginBtnText') || btn.querySelector('span');
            const errorDiv = document.getElementById('authError');
            
            const identifier = document.getElementById('identifier').value.trim();
            const password = document.getElementById('password').value;
            
            if (!identifier || !password) {
                showError(errorDiv, 'Please fill in all fields');
                return;
            }
            
            // Loading state
            btn.disabled = true;
            spinner.classList.remove('hidden');
            btnText.style.opacity = '0';
            errorDiv.classList.remove('show');
            
            try {
                const res = await api('/auth/login', {
                    method: 'POST',
                    body: { identifier, password }
                });
                
                if (res.success) {
                    // Save user data to localStorage
                    localStorage.setItem('user', JSON.stringify(res.data.user));
                    localStorage.setItem('csrf_token', res.data.csrf_token);
                    
                    // Redirect to chat
                    window.location.href = '/chat';
                }
            } catch (err) {
                showError(errorDiv, err.message);
                btn.disabled = false;
                spinner.classList.add('hidden');
                btnText.style.opacity = '1';
            }
        });
    }
    
    // Signup Form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        // Username validation on type
        const usernameInput = document.getElementById('username');
        const usernameError = document.getElementById('usernameError');
        
        usernameInput.addEventListener('input', (e) => {
            const val = e.target.value;
            const isValid = /^[a-zA-Z0-9_]*$/.test(val);
            
            if (!isValid && val.length > 0) {
                usernameInput.classList.add('error');
                usernameError.classList.remove('hidden');
            } else {
                usernameInput.classList.remove('error');
                usernameError.classList.add('hidden');
            }
        });
        
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('signupBtn');
            const spinner = document.getElementById('signupSpinner');
            const btnText = document.getElementById('signupBtnText') || btn.querySelector('span');
            const errorDiv = document.getElementById('authError');
            
            const display_name = document.getElementById('display_name').value.trim();
            const username = document.getElementById('username').value.trim();
            const email = document.getElementById('email').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const password = document.getElementById('password').value;
            
            // Basic validation
            if (!display_name || !username || !email || !password) {
                showError(errorDiv, 'Please fill in all required fields');
                return;
            }
            
            if (password.length < 6) {
                showError(errorDiv, 'Password must be at least 6 characters');
                return;
            }
            
            // Loading state
            btn.disabled = true;
            spinner.classList.remove('hidden');
            btnText.style.opacity = '0';
            errorDiv.classList.remove('show');
            
            try {
                const res = await api('/auth/signup', {
                    method: 'POST',
                    body: { display_name, username, email, phone, password }
                });
                
                if (res.success) {
                    localStorage.setItem('csrf_token', res.data.csrf_token);
                    // Fetch full profile before redirect
                    const profileRes = await api('/auth/profile', { method: 'GET' });
                    if (profileRes.success) {
                        localStorage.setItem('user', JSON.stringify(profileRes.data.user));
                    }
                    window.location.href = '/chat';
                }
            } catch (err) {
                showError(errorDiv, err.message);
                btn.disabled = false;
                spinner.classList.add('hidden');
                btnText.style.opacity = '1';
            }
        });
    }
    
    // Password Toggle
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Toggle icon
            if (type === 'text') {
                togglePassword.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            } else {
                togglePassword.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
            }
        });
    }
    
    function showError(el, msg) {
        el.textContent = msg;
        el.classList.add('show');
        
        // Remove class, trigger reflow, add class again to restart animation
        el.style.animation = 'none';
        el.offsetHeight; /* trigger reflow */
        el.style.animation = null;
    }
});
