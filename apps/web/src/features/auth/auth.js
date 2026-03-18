import { supabase } from '../../core/supabaseClient.js';
import { clearAnimyxAllData, clearAnimyxUserData } from '../../core/clearClientData.js';
import { apiUrl } from '../../config.js';

// --- Validation Handlers ---
export const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
};

export const validatePassword = (password) => {
    return password && password.length >= 8;
};

export const showInlineError = (inputElement, message) => {
    const errorProp = inputElement.closest('.form-group')?.querySelector('.input-error');
    if (errorProp && errorProp.classList.contains('input-error')) {
        errorProp.innerText = message;
        errorProp.setAttribute('role', 'alert');
        errorProp.setAttribute('aria-live', 'polite');
        errorProp.classList.add('visible');
    }
    inputElement.classList.add('error');
};

export const clearInlineError = (inputElement) => {
    const errorProp = inputElement.closest('.form-group')?.querySelector('.input-error');
    if (errorProp && errorProp.classList.contains('input-error')) {
        errorProp.innerText = '';
        errorProp.classList.remove('visible');
    }
    inputElement.classList.remove('error');
};

// --- Animations & State ---
export const initAnimations = () => {
    // Input Focus Animations & Floating Labels
    const inputs = document.querySelectorAll('.auth-input');

    inputs.forEach(input => {
        const parent = input.closest('.form-group-minimal') || input.parentElement;
        if (input.value.trim() !== '') parent.classList.add('has-value');

        input.addEventListener('focus', () => parent.classList.add('focused'));

        input.addEventListener('blur', () => {
            parent.classList.remove('focused');
            if (input.value.trim() !== '') parent.classList.add('has-value');
            else parent.classList.remove('has-value');
        });

        input.addEventListener('input', () => {
            if (input.classList.contains('error')) {
                input.classList.remove('error');
                const errorProp = input.closest('.form-group')?.querySelector('.input-error');
                if (errorProp && errorProp.classList.contains('input-error')) {
                    errorProp.innerText = '';
                    errorProp.classList.remove('visible');
                }
            }
        });
    });

    // Password Visibility Toggle
    const togglePasswordButtons = document.querySelectorAll('.toggle-password');
    togglePasswordButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;
            if (input.type === 'password') {
                input.type = 'text';
                btn.classList.add('showing');
                btn.setAttribute('aria-pressed', 'true');
                btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            } else {
                input.type = 'password';
                btn.classList.remove('showing');
                btn.setAttribute('aria-pressed', 'false');
                btn.innerHTML = '<i class="fas fa-eye"></i>';
            }
        });
    });

    // Page Load Entry Animation
    const authCard = document.querySelector('.auth-card');
    if (authCard) {
        setTimeout(() => authCard.classList.add('animate-enter'), 100);
    }
};

export const setButtonLoading = (btn, isLoading) => {
    if (isLoading) {
        btn.classList.add('loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
};

export const showBackendError = (container, message) => {
    let errorBox = container.querySelector('.backend-error');
    if (!errorBox) {
        errorBox = document.createElement('div');
        errorBox.className = 'backend-error';
        errorBox.setAttribute('role', 'alert');
        errorBox.setAttribute('aria-live', 'assertive');
        container.prepend(errorBox);
    }
    errorBox.innerText = message;
    errorBox.classList.add('shake-anim');
    setTimeout(() => errorBox.classList.remove('shake-anim'), 500);
};

export const clearBackendError = (container) => {
    const errorBox = container.querySelector('.backend-error');
    if (errorBox) errorBox.innerText = '';
};

async function startOAuth(provider, errorContainer) {
    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: `${window.location.origin}/pages/app.html`
        }
    });
    if (error) showBackendError(errorContainer, error.message || 'OAuth sign-in failed');
}

function bindAuxAuthActions({ emailInput, errorContainer }) {
    const forgotLink = document.querySelector('.forgot-link');
    const googleBtn = document.getElementById('btn-google');

    if (forgotLink) {
        forgotLink.addEventListener('click', async (event) => {
            event.preventDefault();
            clearBackendError(errorContainer);
            const email = String(emailInput?.value || '').trim();
            if (!validateEmail(email)) {
                showInlineError(emailInput, 'Enter your account email first');
                return;
            }
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/pages/reset-password.html`
            });
            if (error) {
                showBackendError(errorContainer, error.message || 'Failed to send reset email');
                return;
            }
            showBackendError(errorContainer, 'Password reset link sent. Check your email inbox.');
        });
    }

    if (googleBtn) {
        googleBtn.addEventListener('click', () => {
            clearBackendError(errorContainer);
            void startOAuth('google', errorContainer);
        });
    }
}

function isSessionValid(session) {
    const exp = Number(session?.expires_at || 0);
    if (!session || !Number.isFinite(exp)) return false;
    // Consider token valid if it doesn't expire within 15 seconds
    return Date.now() < (exp * 1000 - 15000);
}

// --- Utils ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function checkUsernameAvailability(username, indicator) {
    if (!username || username.length < 3) {
        indicator.className = 'availability-indicator';
        return false;
    }
    indicator.className = 'availability-indicator loading';
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('name')
            .ilike('name', username)
            .maybeSingle();
            
        if (error) throw error;
        
        if (data) {
            indicator.className = 'availability-indicator error';
            indicator.title = 'Username is already taken';
            return false;
        } else {
            indicator.className = 'availability-indicator success';
            indicator.title = 'Username is available';
            return true;
        }
    } catch (err) {
        console.error('Check username auth error', err);
        indicator.className = 'availability-indicator';
        return true; 
    }
}

// --- Main Auth Logic (SignIn & SignUp) ---
document.addEventListener('DOMContentLoaded', async () => {
    // Prevent redirect loops with a short-lived lock
    const lockTs = Number(sessionStorage.getItem('Animyx:redirectLock') || 0);
    const lockActive = (Date.now() - lockTs) < 3000;

    // Redirect if already authenticated with a valid (non-expiring) token
    const { data: { session } } = await supabase.auth.getSession();
    if (!lockActive && isSessionValid(session)) {
        // If the user was deleted in Supabase, getSession() can still be cached. Confirm with getUser().
        let userOk = false;
        try {
            const { data, error } = await supabase.auth.getUser(session.access_token);
            userOk = Boolean(!error && data?.user);
        } catch {
            userOk = false;
        }

        if (userOk) {
            sessionStorage.setItem('Animyx:redirectLock', String(Date.now()));
            window.location.replace('/pages/app.html'); // Or dashboard
            return;
        }

        // Invalid cached session: clear it and continue on the auth page.
        try { await clearAnimyxAllData(); } catch (_) {}
        await supabase.auth.signOut();
    }

    initAnimations();

    const signInForm = document.getElementById('signin-form');
    const signUpForm = document.getElementById('signup-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorContainer = document.querySelector('.auth-form-body');
    bindAuxAuthActions({ emailInput, errorContainer });

    // Sign In Logic
    if (signInForm) {
        const submitBtn = document.getElementById('signin-btn');
        signInForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearBackendError(errorContainer);

            let isValid = true;
            if (!validateEmail(emailInput.value)) {
                showInlineError(emailInput, 'Please enter a valid email address');
                isValid = false;
            } else {
                clearInlineError(emailInput);
            }

            if (!passwordInput.value) {
                showInlineError(passwordInput, 'Password is required');
                isValid = false;
            } else {
                clearInlineError(passwordInput);
            }

            if (!isValid) return;

            setButtonLoading(submitBtn, true);
            try {
                const { error } = await supabase.auth.signInWithPassword({
                    email: emailInput.value,
                    password: passwordInput.value
                });
                if (error) throw error;
                // Wipe any stale user-scoped caches so new sessions never inherit old libraries.
                try { await clearAnimyxUserData({ keepPreferences: true }); } catch (_) {}
                setTimeout(() => window.location.href = '/pages/app.html', 600);
            } catch (error) {
                showBackendError(errorContainer, error.message || 'Login failed');
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });
    }

    // Sign Up Logic
    if (signUpForm) {
        const submitBtn = document.getElementById('signup-btn');
        const usernameInput = document.getElementById('username');
        const indicator = document.getElementById('username-indicator');
        
        let isUsernameAvailable = false;
        let lastCheckedUsername = '';
        
        if (usernameInput && indicator) {
            usernameInput.addEventListener('input', debounce(async (e) => {
                const val = e.target.value.trim();
                if (val === lastCheckedUsername) return;
                lastCheckedUsername = val;
                
                if (val.length < 3) {
                    showInlineError(usernameInput, 'Username must be at least 3 characters');
                    indicator.className = 'availability-indicator error';
                    isUsernameAvailable = false;
                    return;
                }
                clearInlineError(usernameInput);
                isUsernameAvailable = await checkUsernameAvailability(val, indicator);
                if (!isUsernameAvailable) {
                     showInlineError(usernameInput, 'Username is unavailable');
                }
            }, 500));
        }

        signUpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearBackendError(errorContainer);

            let isValid = true;
            
            if (usernameInput) {
                const uname = usernameInput.value.trim();
                if (uname.length < 3) {
                    showInlineError(usernameInput, 'Username is required');
                    isValid = false;
                } else if (!isUsernameAvailable && uname === lastCheckedUsername) {
                    showInlineError(usernameInput, 'Please choose an available username');
                    isValid = false;
                } else {
                    clearInlineError(usernameInput);
                }
            }
            
            if (!validateEmail(emailInput.value)) {
                showInlineError(emailInput, 'Please enter a valid email address');
                isValid = false;
            } else {
                clearInlineError(emailInput);
            }

            if (!validatePassword(passwordInput.value)) {
                showInlineError(passwordInput, 'Password must be at least 8 characters long');
                isValid = false;
            } else {
                clearInlineError(passwordInput);
            }

            // --- Terms of Service Validation ---
            const termsCheckbox = document.getElementById('terms');
            if (termsCheckbox && !termsCheckbox.checked) {
                showBackendError(errorContainer, 'You must agree to the Terms of Service and Privacy Policy');
                isValid = false;
            }

            if (!isValid) return;

            setButtonLoading(submitBtn, true);
            try {
                const desiredUsername = usernameInput ? usernameInput.value.trim() : '';
                const { data, error } = await supabase.auth.signUp({
                    email: emailInput.value,
                    password: passwordInput.value,
                    options: {
                        // Persist username in auth metadata so it's available even if email confirmation is required.
                        data: desiredUsername ? { name: desiredUsername } : {}
                    }
                });
                if (error) throw error;
                
                // Immediately create a profile if successful and session is given (no email confirmation needed)
                if (data?.user && usernameInput && data.session) {
                   // Prefer backend upsert (service role) so RLS never blocks profile creation.
                   try {
                       await fetch(apiUrl('/users/me/profile'), {
                           method: 'PUT',
                           headers: {
                               'Content-Type': 'application/json',
                               Authorization: `Bearer ${data.session.access_token}`
                           },
                           body: JSON.stringify({ name: desiredUsername })
                       });
                   } catch (_) { }

                   // Fallback: direct insert (may be blocked by RLS depending on your policies).
                   try {
                       await supabase.from('user_profiles').upsert([{
                           user_id: data.user.id,
                           name: desiredUsername
                       }], { onConflict: 'user_id' });
                   } catch (_) { }

                   // Cache locally so the dashboard shows the username immediately after redirect.
                   try {
                       localStorage.setItem('Animyx_profile_v1', JSON.stringify({
                           user_id: data.user.id,
                           name: desiredUsername,
                           updated_at: new Date().toISOString()
                       }));
                   } catch (_) { }
                }
                
                if (data?.user && !data.session) {
                    showBackendError(errorContainer, 'Registration successful. Please check your email inbox to confirm your account.');
                    return;
                }
                setTimeout(() => window.location.href = '/pages/app.html', 600);
            } catch (error) {
                showBackendError(errorContainer, error.message || 'Registration failed');
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });
    }
});

export function initResetPasswordPage() {
    async function run() {
        const form = document.getElementById("reset-form");
        const submitBtn = document.getElementById("reset-btn");
        const newPasswordInput = document.getElementById("new-password");
        const confirmInput = document.getElementById("confirm-password");

        if (!form || !submitBtn || !newPasswordInput || !confirmInput) return;

        const errorContainer =
            document.querySelector(".auth-form-inner")
            || document.querySelector(".auth-form-panel")
            || form;

        try {
            const { data } = await supabase.auth.getSession();
            if (!data?.session) {
                showBackendError(errorContainer, "Reset link is invalid or expired. Request a new password reset email.");
            }
        } catch {
            showBackendError(errorContainer, "Reset link is invalid or expired. Request a new password reset email.");
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearBackendError(errorContainer);
            clearInlineError(newPasswordInput);
            clearInlineError(confirmInput);

            const nextPassword = String(newPasswordInput.value || "");
            const confirmPassword = String(confirmInput.value || "");

            let valid = true;
            if (nextPassword.length < 8) {
                showInlineError(newPasswordInput, "Password must be at least 8 characters.");
                valid = false;
            }
            if (confirmPassword !== nextPassword) {
                showInlineError(confirmInput, "Passwords do not match.");
                valid = false;
            }
            if (!valid) return;

            setButtonLoading(submitBtn, true);
            try {
                const { error } = await supabase.auth.updateUser({ password: nextPassword });
                if (error) throw error;
                showBackendError(errorContainer, "Password updated successfully. Redirecting to sign in...");
                setTimeout(() => { window.location.href = '/pages/signin.html'; }, 1200);
            } catch (error) {
                showBackendError(errorContainer, error?.message || "Failed to update password.");
            } finally {
                setButtonLoading(submitBtn, false);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => { void run(); }, { once: true });
    } else {
        void run();
    }
}

function initSessionBootstrapIfPresent() {
    const overlay = document.getElementById('auth-loading-overlay');
    if (!overlay) return;

    function setOverlayHidden() {
        overlay.classList.add('hidden');
        setTimeout(() => overlay.remove(), 400);
    }

    function persistSession(session) {
        const email = session?.user?.email || '';

        let profileName = '';
        try {
            const raw = localStorage.getItem('Animyx_profile_v1');
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && parsed.user_id === session?.user?.id && parsed.name) profileName = String(parsed.name);
        } catch (_) { }
        const meta = session?.user?.user_metadata || {};
        const metaName = String(meta?.name || meta?.full_name || '').trim();
        const displayName = profileName || metaName || (email.split('@')[0] || 'Otaku');

        const userState = {
            id: session.user.id,
            email,
            name: displayName,
            accessToken: session.access_token,
            user_metadata: meta
        };
        localStorage.setItem('Animyx:currentUser', JSON.stringify(userState));

        const headerName = document.getElementById('header-username');
        if (headerName) headerName.textContent = displayName;
        const profileNameEl = document.getElementById('profile-display-name');
        if (profileNameEl) profileNameEl.textContent = displayName;
    }

    function applyDisplayName(name) {
        const next = String(name || '').trim();
        if (!next) return;

        try {
            const raw = localStorage.getItem('Animyx:currentUser');
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === 'object') {
                parsed.name = next;
                localStorage.setItem('Animyx:currentUser', JSON.stringify(parsed));
            }
        } catch (_) { }

        const headerName = document.getElementById('header-username');
        if (headerName) headerName.textContent = next;
        const profileNameEl = document.getElementById('profile-display-name');
        if (profileNameEl) profileNameEl.textContent = next;
    }

    async function fetchAndApplyCloudProfileName(accessToken) {
        const token = String(accessToken || '').trim();
        if (!token) return;

        try {
            const res = await fetch(apiUrl('/users/me/profile'), {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return;
            const payload = await res.json();
            const name = String(payload?.data?.name || '').trim();
            const userId = String(payload?.data?.user_id || '').trim();
            if (!name) return;

            try {
                const next = {
                    ...(payload?.data || {}),
                    user_id: userId || (payload?.data?.user_id ?? undefined),
                    name
                };
                localStorage.setItem('Animyx_profile_v1', JSON.stringify(next));
            } catch (_) { }

            applyDisplayName(name);
        } catch (_) { }
    }

    async function bootstrapProfileFromAuthMetadata(session) {
        const meta = session?.user?.user_metadata || {};
        const name = String(meta?.name || meta?.full_name || '').trim();
        if (!name) return;

        try {
            const raw = localStorage.getItem('Animyx_profile_v1');
            const parsed = raw ? JSON.parse(raw) : {};
            const next = {
                ...parsed,
                user_id: session.user.id,
                name: parsed?.name || name,
                updated_at: new Date().toISOString()
            };
            localStorage.setItem('Animyx_profile_v1', JSON.stringify(next));
        } catch (_) { }

        try {
            await fetch(apiUrl('/users/me/profile'), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ name })
            });
        } catch (_) { }
    }

    async function forceSignOut() {
        try { await clearAnimyxAllData(); } catch (_) { }
        try { await supabase.auth.signOut(); } catch (_) { }
    }

    async function validateSessionUser(session) {
        if (!session?.access_token) return false;

        const USER_TIMEOUT_MS = 4000;
        const timeout = new Promise((resolve) =>
            setTimeout(() => resolve({ data: null, error: new Error('User timeout') }), USER_TIMEOUT_MS)
        );

        try {
            const result = await Promise.race([supabase.auth.getUser(session.access_token), timeout]);
            return Boolean(result?.data?.user && !result?.error);
        } catch {
            return false;
        }
    }

    async function initializeAuth() {
        try {
            const SESSION_TIMEOUT_MS = 5000;
            const timeout = new Promise((resolve) =>
                setTimeout(() => resolve({ data: null, error: new Error('Auth timeout') }), SESSION_TIMEOUT_MS)
            );
            const result = await Promise.race([supabase.auth.getSession(), timeout]);
            const session = result?.data?.session ?? null;

            if (!session) {
                if (!window.location.pathname.endsWith('/pages/signin.html')) {
                    sessionStorage.setItem('Animyx:redirectLock', String(Date.now()));
                    window.location.replace('/pages/signin.html');
                }
                return;
            }

            const userOk = await validateSessionUser(session);
            if (!userOk) {
                await forceSignOut();
                if (!window.location.pathname.endsWith('/pages/signin.html')) {
                    sessionStorage.setItem('Animyx:redirectLock', String(Date.now()));
                    window.location.replace('/pages/signin.html');
                }
                return;
            }

            await bootstrapProfileFromAuthMetadata(session);

            try {
                const prevUserId = String(localStorage.getItem('Animyx:lastUserId') || '');
                const nextUserId = String(session?.user?.id || '');
                if (prevUserId && nextUserId && prevUserId !== nextUserId) {
                    await clearAnimyxUserData({ keepPreferences: true });
                }
                if (nextUserId) localStorage.setItem('Animyx:lastUserId', nextUserId);
            } catch (_) { }

            persistSession(session);
            void fetchAndApplyCloudProfileName(session.access_token);

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch((error) => {
                    console.warn('SW registration failed:', error);
                });
            }

            supabase.auth.onAuthStateChange((event, nextSession) => {
                if (nextSession) {
                    persistSession(nextSession);
                } else {
                    void clearAnimyxUserData({ keepPreferences: true });
                    if (!window.location.pathname.endsWith('/pages/signin.html')) {
                        sessionStorage.setItem('Animyx:redirectLock', String(Date.now()));
                        window.location.replace('/pages/signin.html');
                    }
                }
            });

            window.addEventListener('Animyx:auth-invalid', () => { void forceSignOut(); }, { passive: true });

            setOverlayHidden();
        } catch (err) {
            console.error('[Animyx] Auth initialization error:', err);
            setOverlayHidden();
            if (!window.location.pathname.endsWith('/pages/signin.html')) {
                sessionStorage.setItem('Animyx:redirectLock', String(Date.now()));
                window.location.replace('/pages/signin.html');
            }
        }
    }

    function bindLogout() {
        const logoutBtn = document.querySelector('.logout-btn');
        if (!logoutBtn) return;
        logoutBtn.addEventListener('click', async () => {
            logoutBtn.disabled = true;
            logoutBtn.style.opacity = '0.6';
            await clearAnimyxUserData({ keepPreferences: true });
            await supabase.auth.signOut();
            window.location.href = '/pages/signin.html';
        });
    }

    window.__Animyx_AUTH_READY = initializeAuth();
    document.addEventListener('DOMContentLoaded', bindLogout);
}

initResetPasswordPage();
initSessionBootstrapIfPresent();
