/**
 * PrimeChat — Authentication Logic
 * Handles Login and Signup forms with advanced UX
 */

document.addEventListener('DOMContentLoaded', () => {
    
    let authAbortController = null;

    // Helper: Debounce function for live validation
    const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    };

    // Helper: Set Button Loading State
    const setLoadingState = (btnId, isLoading) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const spinner = btn.querySelector('.spinner');
        const span = btn.querySelector('span');
        
        btn.disabled = isLoading;
        if (isLoading) {
            if (spinner) spinner.classList.remove('hidden');
            if (span) span.style.opacity = '0';
        } else {
            if (spinner) spinner.classList.add('hidden');
            if (span) span.style.opacity = '1';
        }
    };

    // Helper: Show global error
    const showGlobalError = (msg) => {
        const errorDiv = document.getElementById('authError');
        if (!errorDiv) return;
        errorDiv.textContent = msg;
        errorDiv.classList.add('show');
        errorDiv.style.animation = 'none';
        errorDiv.offsetHeight; /* trigger reflow */
        errorDiv.style.animation = null;
    };

    const hideGlobalError = () => {
        const errorDiv = document.getElementById('authError');
        if (errorDiv) errorDiv.classList.remove('show');
    };

    // Helper: Show inline error
    const setFieldError = (inputId, msg) => {
        const input = document.getElementById(inputId);
        const errorDiv = document.getElementById(`${inputId}Error`);
        if (!input || !errorDiv) return;
        
        if (msg) {
            input.classList.add('error');
            input.classList.remove('success');
            errorDiv.textContent = msg;
            errorDiv.classList.add('show');
        } else {
            input.classList.remove('error');
            input.classList.add('success');
            errorDiv.textContent = '';
            errorDiv.classList.remove('show');
        }
    };

    const clearFieldError = (inputId) => {
        const input = document.getElementById(inputId);
        const errorDiv = document.getElementById(`${inputId}Error`);
        if (!input || !errorDiv) return;
        input.classList.remove('error', 'success');
        errorDiv.textContent = '';
        errorDiv.classList.remove('show');
    };

    // ==========================================
    // LOGIN FLOW
    // ==========================================
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        
        // Remove success/error classes on input
        ['identifier', 'password'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', () => {
                    clearFieldError(id);
                    hideGlobalError();
                });
            }
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const identifier = document.getElementById('identifier').value.trim();
            const password = document.getElementById('password').value;
            
            let hasError = false;
            if (!identifier) { setFieldError('identifier', 'This field is required'); hasError = true; }
            if (!password) { setFieldError('password', 'Password is required'); hasError = true; }
            
            if (hasError) return;

            // Cancel any pending request
            if (authAbortController) authAbortController.abort();
            authAbortController = new AbortController();
            
            setLoadingState('loginBtn', true);
            hideGlobalError();
            
            try {
                const res = await api('/auth/login', {
                    method: 'POST',
                    body: { identifier, password },
                    signal: authAbortController.signal
                });
                
                if (res.success) {
                    const btn = document.getElementById('loginBtn');
                    btn.classList.add('success');
                    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    
                    localStorage.setItem('user', JSON.stringify(res.data.user));
                    localStorage.setItem('csrf_token', res.data.csrf_token);
                    
                    setTimeout(() => { window.location.href = '/chat'; }, 500);
                }
            } catch (err) {
                if (err.name === 'AbortError') return;
                showGlobalError(err.message || 'Invalid credentials');
                setLoadingState('loginBtn', false);
            }
        });
    }
    
    // ==========================================
    // SIGNUP FLOW
    // ==========================================
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        
        // Live validation rules
        const rules = {
            display_name: (val) => val.trim().length < 2 ? 'Name is too short' : null,
            username: (val) => !/^[a-zA-Z0-9_]{3,50}$/.test(val) ? '3-50 chars, alphanumeric/underscores only' : null,
            email: (val) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? 'Invalid email format' : null,
            password: (val) => val.length < 6 ? 'Must be at least 6 characters' : null
        };

        // Attach debounced validators
        Object.keys(rules).forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', debounce((e) => {
                    const val = e.target.value.trim();
                    if (!val) { clearFieldError(id); return; }
                    const error = rules[id](val);
                    setFieldError(id, error);
                }, 400));
            }
        });

        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fields = ['display_name', 'username', 'email', 'phone', 'password'];
            const data = {};
            let hasError = false;

            fields.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const val = id === 'password' ? el.value : el.value.trim();
                data[id] = val;
                
                if (!val && id !== 'phone') {
                    setFieldError(id, 'This field is required');
                    hasError = true;
                } else if (rules[id] && val && rules[id](val)) {
                    setFieldError(id, rules[id](val));
                    hasError = true;
                }
            });
            
            if (hasError) return;

            // Cancel any pending request
            if (authAbortController) authAbortController.abort();
            authAbortController = new AbortController();
            
            setLoadingState('signupBtn', true);
            hideGlobalError();
            
            try {
                const res = await api('/auth/signup', {
                    method: 'POST',
                    body: data,
                    signal: authAbortController.signal
                });
                
                if (res.success) {
                    const btn = document.getElementById('signupBtn');
                    btn.classList.add('success');
                    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';

                    localStorage.setItem('csrf_token', res.data.csrf_token);
                    
                    // Fetch profile background
                    api('/auth/profile', { method: 'GET' }).then(pRes => {
                        if (pRes.success) localStorage.setItem('user', JSON.stringify(pRes.data.user));
                    }).catch(()=>{});

                    setTimeout(() => { window.location.href = '/chat'; }, 600);
                }
            } catch (err) {
                if (err.name === 'AbortError') return;
                
                // Map API errors to inline fields if possible
                const msg = err.message || '';
                if (msg.toLowerCase().includes('username')) setFieldError('username', msg);
                else if (msg.toLowerCase().includes('email')) setFieldError('email', msg);
                else showGlobalError(msg || 'Failed to create account');
                
                setLoadingState('signupBtn', false);
            }
        });
    }
    
    // ==========================================
    // PASSWORD TOGGLE
    // ==========================================
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const isText = passwordInput.getAttribute('type') === 'text';
            passwordInput.setAttribute('type', isText ? 'password' : 'text');
            
            if (isText) {
                togglePassword.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
            } else {
                togglePassword.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            }
        });
    }
});
