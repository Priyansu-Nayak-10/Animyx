// Prefer window.ENV for runtime injection; fall back to Vite env for local dev.
const env = window.ENV || window.__ENV || {};
const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

const API_BASE = String(env.API_BASE || '/api').trim();
const normalizedBackendUrl = API_BASE.endsWith('/') && API_BASE.length > 1 ? API_BASE.slice(0, -1) : API_BASE;

export const CONFIG = Object.freeze({
  backendUrl: normalizedBackendUrl,
  supabaseUrl: String(env.SUPABASE_URL || metaEnv.VITE_SUPABASE_URL || ''),
  supabaseAnonKey: String(env.SUPABASE_ANON_KEY || metaEnv.VITE_SUPABASE_ANON_KEY || '')
});

export const BACKEND_URL = CONFIG.backendUrl;
export const BACKEND_ORIGIN = new URL(BACKEND_URL, window.location.origin).origin;
export const SUPABASE_URL = CONFIG.supabaseUrl;
export const SUPABASE_ANON_KEY = CONFIG.supabaseAnonKey;

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('Animyx:currentUser') || 'null');
  } catch {
    return null;
  }
}

export function getAccessToken() {
  return getCurrentUser()?.accessToken || '';
}

export function withAuthHeaders(headers = {}) {
  const merged = { ...headers };
  const token = getAccessToken();
  if (token && !merged.Authorization) merged.Authorization = `Bearer ${token}`;
  return merged;
}

export async function authFetch(input, init = {}) {
  const nextInit = {
    ...init,
    headers: withAuthHeaders(init.headers || {})
  };
  const res = await fetch(input, nextInit);
  if (res.status === 401) {
    try {
      localStorage.removeItem('Animyx:currentUser');
    } catch (_) { /* ignore */ }
    try {
      window.dispatchEvent(new CustomEvent('Animyx:auth-invalid'));
    } catch (_) { /* ignore */ }
    if (!window.location.pathname.endsWith('/pages/signin.html')) {
      window.location.replace('/pages/signin.html');
    }
  }
  return res;
}

export function apiUrl(path) {
  const safePath = String(path || '');
  if (/^https?:\/\//i.test(safePath)) return safePath;
  if (safePath.startsWith('/')) return `${BACKEND_URL}${safePath}`;
  return `${BACKEND_URL}/${safePath}`;
}
