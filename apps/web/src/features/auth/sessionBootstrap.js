import './auth.js';

/* Legacy implementation migrated into auth.js.
import { supabase } from '../../core/supabaseClient.js';
import { clearAnimexAllData, clearAnimexUserData } from '../../core/clearClientData.js';
import { apiUrl } from '../../config.js';

function setOverlayHidden() {
  const overlay = document.getElementById('auth-loading-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 400);
}

function persistSession(session) {
  const email = session?.user?.email || '';

  // Prefer user-chosen username (profile name / auth metadata) over email prefix.
  let profileName = '';
  try {
    const raw = localStorage.getItem('animex_profile_v1');
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
    // Used as a fallback for profile UI until cloud profile is fetched.
    user_metadata: meta
  };
  localStorage.setItem('animex:currentUser', JSON.stringify(userState));

  const headerName = document.getElementById('header-username');
  if (headerName) headerName.textContent = displayName;
  const profileNameEl = document.getElementById('profile-display-name');
  if (profileNameEl) profileNameEl.textContent = displayName;
}

function applyDisplayName(name) {
  const next = String(name || '').trim();
  if (!next) return;

  // Update stored currentUser.name so other parts of the UI use the right value.
  try {
    const raw = localStorage.getItem('animex:currentUser');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      parsed.name = next;
      localStorage.setItem('animex:currentUser', JSON.stringify(parsed));
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

    // Cache locally for future boots.
    try {
      const next = {
        ...(payload?.data || {}),
        user_id: userId || (payload?.data?.user_id ?? undefined),
        name
      };
      localStorage.setItem('animex_profile_v1', JSON.stringify(next));
    } catch (_) { }

    applyDisplayName(name);
  } catch (_) { }
}

async function bootstrapProfileFromAuthMetadata(session) {
  const meta = session?.user?.user_metadata || {};
  const name = String(meta?.name || meta?.full_name || '').trim();
  if (!name) return;

  // Ensure local profile cache exists so the dashboard shows the username immediately.
  try {
    const raw = localStorage.getItem('animex_profile_v1');
    const parsed = raw ? JSON.parse(raw) : {};
    const next = {
      ...parsed,
      user_id: session.user.id,
      name: parsed?.name || name,
      updated_at: new Date().toISOString()
    };
    localStorage.setItem('animex_profile_v1', JSON.stringify(next));
  } catch (_) { }

  // Best-effort: upsert into backend profile so it persists even when signup required email confirm.
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
  // Hard reset: fixes deleted-user cached sessions + clears any user-scoped caches.
  try { await clearAnimexAllData(); } catch (_) {}
  try { await supabase.auth.signOut(); } catch (_) {}
}

async function validateSessionUser(session) {
  if (!session?.access_token) return false;

  // If the user was deleted in Supabase, getSession() may still return a cached session.
  // getUser() is the definitive check to prevent redirect loops.
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
    // Timeout guard — if Supabase hangs, don't leave the overlay stuck
    const SESSION_TIMEOUT_MS = 5000;
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('Auth timeout') }), SESSION_TIMEOUT_MS)
    );
    const result = await Promise.race([supabase.auth.getSession(), timeout]);
    const session = result?.data?.session ?? null;

    if (!session) {
      // Prevent redirect loops: only redirect if we're not already on signin page
      if (!window.location.pathname.endsWith('/pages/signin.html')) {
        sessionStorage.setItem('animex:redirectLock', String(Date.now()));
        window.location.replace('/pages/signin.html');
      }
      return;
    }

    const userOk = await validateSessionUser(session);
    if (!userOk) {
      await forceSignOut();
      if (!window.location.pathname.endsWith('/pages/signin.html')) {
        sessionStorage.setItem('animex:redirectLock', String(Date.now()));
        window.location.replace('/pages/signin.html');
      }
      return;
    }

    await bootstrapProfileFromAuthMetadata(session);

    // If a different user signs in on the same device, wipe user-scoped caches so the UI never shows
    // the previous account's library/profile/settings.
    try {
      const prevUserId = String(localStorage.getItem('animex:lastUserId') || '');
      const nextUserId = String(session?.user?.id || '');
      if (prevUserId && nextUserId && prevUserId !== nextUserId) {
        await clearAnimexUserData({ keepPreferences: true });
      }
      if (nextUserId) localStorage.setItem('animex:lastUserId', nextUserId);
    } catch (_) { }

    persistSession(session);

    // Hydrate display name from cloud profile (authoritative) after we have a token.
    // This fixes cases where user_profiles exists but auth metadata is empty.
    void fetchAndApplyCloudProfileName(session.access_token);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('SW registration failed:', error);
      });
    }

    // Keep session in sync on future auth changes (token refresh or sign-out)
    supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession) {
        persistSession(nextSession);
      } else {
        // Normal sign-out: clear user data (keep theme/accent).
        void clearAnimexUserData({ keepPreferences: true });
        if (!window.location.pathname.endsWith('/pages/signin.html')) {
          sessionStorage.setItem('animex:redirectLock', String(Date.now()));
          window.location.replace('/pages/signin.html');
        }
      }
    });

    // Allow API layer to signal an invalid session (prevents cached session loops).
    window.addEventListener('animex:auth-invalid', () => { void forceSignOut(); }, { passive: true });

    setOverlayHidden();
  } catch (err) {
    // Never leave the overlay stuck — always hide it even on unexpected errors
    console.error('[Animex] Auth initialization error:', err);
    setOverlayHidden();
    // Redirect to signin as fallback only if not already there
    if (!window.location.pathname.endsWith('/pages/signin.html')) {
      sessionStorage.setItem('animex:redirectLock', String(Date.now()));
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
    await clearAnimexUserData({ keepPreferences: true });
    await supabase.auth.signOut();
    window.location.href = '/pages/signin.html';
  });
}

window.__ANIMEX_AUTH_READY = initializeAuth();
document.addEventListener('DOMContentLoaded', bindLogout);
*/
