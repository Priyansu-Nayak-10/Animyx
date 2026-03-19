/**
 * core/sync.js
 * Real-time and Cloud Library Sync modules.
 */

import { authFetch, apiUrl, getAccessToken } from "../config.js";
import { getState, setState } from "../store.js";
import { getClientId } from "./utils.js"; // Renamed from clientId.js
import { createApiClient } from "./api.js";

// Mock or existing Supabase client - assuming it's initialized globally or imported
// For the sake of this refactor, we'll assume 'supabase' is available or imported from a central config
import { supabase } from "../config.js"; 

class SyncService {
  constructor() {
    this.channels = new Map();
    this.currentUser = null;
    this.libraryStore = null;
  }

  async init({ libraryStore }) {
    this.libraryStore = libraryStore;
    this.currentUser = getState('currentUser');
    if (this.currentUser?.id) this.subscribe();
  }

  subscribe() {
    const userId = this.currentUser?.id;
    if (!userId || !supabase) return;

    this.channels.set('library', supabase.channel(`sync:library:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'followed_anime', filter: `user_id=eq.${userId}` }, (p) => this.handleLibraryChange(p)).subscribe());
    this.channels.set('profile', supabase.channel(`sync:profile:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles', filter: `user_id=eq.${userId}` }, (p) => this.handleProfileChange(p)).subscribe());
    this.channels.set('settings', supabase.channel(`sync:settings:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` }, (p) => this.handleSettingsChange(p)).subscribe());
  }

  unsubscribe() {
    this.channels.forEach((c) => supabase.removeChannel(c));
    this.channels.clear();
  }

  handleLibraryChange(p) {
    if (!this.libraryStore || p.eventType === 'DELETE') return;
    const item = p.new;
    if (String(item?.client_id) === getClientId()) return;
    
    // Minimal merge logic (referenced from appCore.js)
    const normalized = {
      malId: Number(item.mal_id),
      title: item.title,
      image: item.image,
      status: String(item.status).toLowerCase(),
      progress: Number(item.next_episode),
      updatedAt: Date.now()
    };
    this.libraryStore.upsert(normalized, normalized.status);
  }

  handleProfileChange(p) {
    if (p.eventType === 'DELETE') return;
    const d = p.new;
    const profile = { name: d.name, bio: d.bio, avatar: d.avatar };
    localStorage.setItem('Animyx_profile_v1', JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent('Animyx:profile-sync', { detail: profile }));
  }

  handleSettingsChange(p) {
    if (p.eventType === 'DELETE') return;
    const d = p.new;
    const settings = { darkTheme: d.dark_theme, accentColor: d.accent_color };
    localStorage.setItem('Animyx_settings_v1', JSON.stringify(settings));
    setState({ theme: settings.darkTheme ? 'dark' : 'light', accentColor: settings.accentColor });
  }
}

export const syncService = new SyncService();

// ── Cloud Sync ───────────────────────────────────────────────────────────────

const api = createApiClient();

export function initLibraryCloudSync({ libraryStore, toast = null }) {
  if (!libraryStore) return { destroy() {} };
  
  let syncTimer = setInterval(async () => {
    if (!navigator.onLine || !getAccessToken()) return;
    try {
      const res = await authFetch(apiUrl('/users/me/followed'));
      if (res.ok) {
        // Sync logic would go here
      }
    } catch {}
  }, 120000);

  return { destroy() { clearInterval(syncTimer); } };
}
