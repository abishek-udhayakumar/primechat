/**
 * PrimeChat — Authentication Logic
 * Handles Login and Signup forms with premium UX
 */

document.addEventListener('DOMContentLoaded', () => {
    
    let _authAbort = null;

    // ── Helper: Debounce ──
    const debounce = (fn, ms) => {
        let t;
        return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    };

    // ── Button Loading State ──
    // Uses CSS class toggle — zero layout shift
    const setLoading = (btnId, loading) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.disabled = loading;
        if (loading) {
            btn.classList.add('loading');
            btn.classList.remove('success');
        } else {
            btn.classList.remove('loading');
        }
    };

    // ── Global Error Banner ──
    const showError = (msg) => {
        const el = document.getElementById('authError');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        // Re-trigger animation
        el.style.animation = 'none';
        el.offsetHeight;
        el.style.animation = null;
    };
    const hideError = () => {
        document.getElementById('authError')?.classList.remove('show');
    };

    // ── Field Error/Success ──
    const setFieldError = (id, msg) => {
        const input = document.getElementById(id);
        const err = document.getElementById(`${id}Error`);
        if (!input || !err) return;
        if (msg) {
            input.classList.add('error');
            input.classList.remove('success');
            err.textContent = msg;
            err.classList.add('show');
        } else {
            input.classList.remove('error');
            input.classList.add('success');
            err.textContent = '';
            err.classList.remove('show');
        }
    };
    const clearField = (id) => {
        const input = document.getElementById(id);
        const err = document.getElementById(`${id}Error`);
        if (input) input.classList.remove('error', 'success');
        if (err) { err.textContent = ''; err.classList.remove('show'); }
    };

    // ── Show Success (checkmark) ──
    const showSuccess = (btnId) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.classList.remove('loading');
        btn.classList.add('success');
        btn.disabled = true;
        // Replace content with animated checkmark
        btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" style="animation:checkDraw 0.3s ease-out forwards;stroke-dasharray:30;stroke-dashoffset:30;"></polyline></svg>';
    };

    // ==========================================
    // LOGIN
    // ==========================================
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        // Clear errors on input
        ['identifier', 'password'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                clearField(id);
                hideError();
            });
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const identifier = document.getElementById('identifier').value.trim();
            const password = document.getElementById('password').value;

            let hasError = false;
            if (!identifier) { setFieldError('identifier', 'This field is required'); hasError = true; }
            if (!password) { setFieldError('password', 'Password is required'); hasError = true; }
            if (hasError) return;

            // Cancel any in-flight request
            if (_authAbort) _authAbort.abort();
            _authAbort = new AbortController();

            setLoading('loginBtn', true);
            hideError();

            try {
                const res = await api('/auth/login', {
                    method: 'POST',
                    body: { identifier, password },
                    signal: _authAbort.signal
                });

                if (res.success) {
                    showSuccess('loginBtn');
                    localStorage.setItem('user', JSON.stringify(res.data.user));
                    localStorage.setItem('csrf_token', res.data.csrf_token);
                    setTimeout(() => { window.location.href = '/chat'; }, 500);
                }
            } catch (err) {
                if (err.name === 'AbortError') return;
                showError(err.message || 'Invalid credentials');
                setLoading('loginBtn', false);
            }
        });
    }

    // ==========================================
    // SIGNUP
    // ==========================================
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        const rules = {
            display_name: (v) => v.trim().length < 2 ? 'Name is too short' : null,
            username: (v) => !/^[a-zA-Z0-9_]{3,50}$/.test(v) ? '3-50 chars, letters/numbers/underscores' : null,
            email: (v) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Invalid email format' : null,
            password: (v) => v.length < 6 ? 'Must be at least 6 characters' : null
        };

        // Live validation (debounced)
        Object.keys(rules).forEach(id => {
            document.getElementById(id)?.addEventListener('input', debounce((e) => {
                const val = e.target.value.trim();
                if (!val) { clearField(id); return; }
                setFieldError(id, rules[id](val));
            }, 400));
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

            if (_authAbort) _authAbort.abort();
            _authAbort = new AbortController();

            setLoading('signupBtn', true);
            hideError();

            try {
                const res = await api('/auth/signup', {
                    method: 'POST',
                    body: data,
                    signal: _authAbort.signal
                });

                if (res.success) {
                    showSuccess('signupBtn');
                    localStorage.setItem('csrf_token', res.data.csrf_token);

                    // Fetch profile in background
                    api('/auth/profile', { method: 'GET' }).then(pRes => {
                        if (pRes?.success) localStorage.setItem('user', JSON.stringify(pRes.data.user));
                    }).catch(() => {});

                    setTimeout(() => { window.location.href = '/chat'; }, 600);
                }
            } catch (err) {
                if (err.name === 'AbortError') return;
                const msg = err.message || '';
                if (msg.toLowerCase().includes('username')) setFieldError('username', msg);
                else if (msg.toLowerCase().includes('email')) setFieldError('email', msg);
                else showError(msg || 'Failed to create account');
                setLoading('signupBtn', false);
            }
        });
    }

    // ==========================================
    // PASSWORD TOGGLE
    // ==========================================
    const toggleBtn = document.getElementById('togglePassword');
    const pwInput = document.getElementById('password');

    if (toggleBtn && pwInput) {
        toggleBtn.addEventListener('click', () => {
            const showing = pwInput.type === 'text';
            pwInput.type = showing ? 'password' : 'text';
            toggleBtn.innerHTML = showing
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
        });
    }
});
