export { syncService } from './appCore.js';

/* Legacy implementation moved to core/appCore.js.
import { supabase } from './supabaseClient.js';
import { getState, setState } from '../store.js';
import { getClientId } from './clientId.js';

/**
 * syncService.js — Real-time Data Synchronization
 * Handles instant updates across devices using Supabase Realtime.
 */

class SyncService {
  constructor() {
    this.channels = new Map();
    this.isAuthenticated = false;
    this.currentUser = null;
    this.libraryStore = null;
  }

  /**
   * Initialize sync service with application stores
   * @param {Object} options 
   */
  async init({ libraryStore }) {
    this.libraryStore = libraryStore;
    
    // Initial sync of current user state
    this.currentUser = getState('currentUser');
    // `isAuthenticated` isn't consistently persisted; `currentUser` is the source of truth here.
    if (this.currentUser?.id) {
      this.subscribe();
    }
  }

  /**
   * Subscribe to Supabase Realtime channels
   */
  subscribe() {
    const userId = this.currentUser?.id;
    if (!userId) return;

    console.log('[SyncService] 📡 Subscribing to real-time updates...');

    // 1. Library Sync Channel
    const libraryChannel = supabase
      .channel(`sync:library:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'followed_anime', filter: `user_id=eq.${userId}` },
        (payload) => this.handleLibraryChange(payload)
      )
      .subscribe();

    // 2. Profile Sync Channel
    const profileChannel = supabase
      .channel(`sync:profile:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles', filter: `user_id=eq.${userId}` },
        (payload) => this.handleProfileChange(payload)
      )
      .subscribe();

    // 3. Settings Sync Channel
    const settingsChannel = supabase
      .channel(`sync:settings:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` },
        (payload) => this.handleSettingsChange(payload)
      )
      .subscribe();

    this.channels.set('library', libraryChannel);
    this.channels.set('profile', profileChannel);
    this.channels.set('settings', settingsChannel);
  }

  /**
   * Unsubscribe from all channels
   */
  unsubscribe() {
    this.channels.forEach(channel => supabase.removeChannel(channel));
    this.channels.clear();
  }

  /**
   * Handle changes to followed_anime table
   */
  handleLibraryChange(payload) {
    if (!this.libraryStore) return;

    const { eventType, new: newItem, old: oldItem } = payload;
    console.log('[SyncService] Library change received:', eventType);

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      // Ignore our own writes echoed back via realtime (prevents device/tab feedback loops).
      const localClientId = getClientId();
      const remoteClientId = String(newItem?.client_id || '');
      if (remoteClientId && remoteClientId === localClientId) return;

      // Tell CloudSync we're applying a remote change so it doesn't push it back.
      window.dispatchEvent(new CustomEvent('animex:library-sync-applying', {
        detail: { source: 'supabase', eventType, malId: newItem?.mal_id || null }
      }));

      const malId = Number(newItem?.mal_id || 0);
      const progress = Math.max(0, Number(newItem?.next_episode || 0));
      const episodes = Math.max(0, Number(newItem?.total_episodes || 0));
      const status = String(newItem?.status || 'plan').toLowerCase();
      const remoteUpdatedAt = Date.parse(newItem?.updated_at || newItem?.last_checked || newItem?.created_at) || 0;
      const remoteWatchProgressAt = Date.parse(newItem?.watch_progress_at || '') || 0;
      const remoteCompletedAt = Date.parse(newItem?.completed_at || '') || 0;
      const remoteRatingUpdatedAt = Date.parse(newItem?.rating_updated_at || '') || 0;
      const remoteWatchlistAddedAt = Date.parse(newItem?.watchlist_added_at || '') || 0;
      const remoteUserRatingRaw = Number(newItem?.user_rating);
      const remoteUserRating = Number.isFinite(remoteUserRatingRaw) && remoteUserRatingRaw > 0 ? remoteUserRatingRaw : null;

      // Per-field conflict resolution (merge, not overwrite):
      // Compare the remote field timestamps to local timestamps so progress + rating updates don't clobber each other.
      const local = this.libraryStore.getAll().find((row) => Number(row?.malId || 0) === malId) || {};
      const localWatchProgressAt = Number(local?.watchProgressAt || 0) || 0;
      const localCompletedAt = Number(local?.completedAt || 0) || 0;
      const localRatingUpdatedAt = Number(local?.ratingUpdatedAt || 0) || 0;
      const localWatchlistAddedAt = Number(local?.watchlistAddedAt || 0) || 0;
      const localUpdatedAt = Number(local?.updatedAt || 0) || 0;

      const shouldTake = (remoteTs, localTs) => Number(remoteTs || 0) > Number(localTs || 0);

      const normalized = {
        malId,
        title: shouldTake(remoteUpdatedAt, localUpdatedAt) ? String(newItem?.title || `Anime #${malId}`) : (local?.title || String(newItem?.title || `Anime #${malId}`)),
        image: shouldTake(remoteUpdatedAt, localUpdatedAt) ? String(newItem?.image || '') : (local?.image || String(newItem?.image || '')),
        status: shouldTake(remoteUpdatedAt, localUpdatedAt) ? status : (local?.status || status),
        progress: shouldTake(remoteWatchProgressAt, localWatchProgressAt) ? progress : Number(local?.progress || 0),
        watchedEpisodes: shouldTake(remoteWatchProgressAt, localWatchProgressAt) ? progress : Number(local?.watchedEpisodes || local?.progress || 0),
        episodes,
        updatedAt: remoteUpdatedAt || Date.now(),
        watchProgressAt: shouldTake(remoteWatchProgressAt, localWatchProgressAt) ? remoteWatchProgressAt : localWatchProgressAt,
        completedAt: shouldTake(remoteCompletedAt, localCompletedAt) ? remoteCompletedAt : localCompletedAt,
        ratingUpdatedAt: shouldTake(remoteRatingUpdatedAt, localRatingUpdatedAt) ? remoteRatingUpdatedAt : localRatingUpdatedAt,
        watchlistAddedAt: shouldTake(remoteWatchlistAddedAt, localWatchlistAddedAt) ? remoteWatchlistAddedAt : localWatchlistAddedAt,
        userRating: shouldTake(remoteRatingUpdatedAt, localRatingUpdatedAt) ? remoteUserRating : (local?.userRating ?? remoteUserRating)
      };
      
      // Upsert but avoid infinite loops if it was a local change
      // Note: libraryStore.init or custom internal update should be used 
      // to avoid triggering another cloud push if possible.
      this.libraryStore.upsert(normalized, normalized.status);

      // Notify cloudSync to not push this change back
      window.dispatchEvent(new CustomEvent('animex:library-sync-received', { detail: normalized }));
    } else if (eventType === 'DELETE') {
      const localClientId = getClientId();
      const remoteClientId = String(oldItem?.client_id || '');
      if (remoteClientId && remoteClientId === localClientId) return;

      window.dispatchEvent(new CustomEvent('animex:library-sync-applying', {
        detail: { source: 'supabase', eventType, malId: oldItem?.mal_id || null }
      }));
      this.libraryStore.remove(oldItem.mal_id);
      window.dispatchEvent(new CustomEvent('animex:library-sync-received', { detail: { malId: oldItem?.mal_id || null, deleted: true } }));
    }
  }

  /**
   * Handle changes to user_profiles table
   */
  handleProfileChange(payload) {
    if (payload.eventType === 'DELETE') return;
    
    console.log('[SyncService] Profile change received');
    const data = payload.new;
    const profile = {
      name: data.name,
      bio: data.bio,
      avatar: data.avatar,
      banner: data.banner,
      mal: data.mal,
      al: data.al
    };

    // Update localStorage to trigger UI refresh (if userFeatures is listening)
    localStorage.setItem('animex_profile_v1', JSON.stringify(profile));
    
    // Dispatch custom event for UI components
    window.dispatchEvent(new CustomEvent('animex:profile-sync', { detail: profile }));
  }

  /**
   * Handle changes to user_settings table
   */
  handleSettingsChange(payload) {
    if (payload.eventType === 'DELETE') return;

    console.log('[SyncService] Settings change received');
    const data = payload.new;
    const settings = {
      darkTheme: data.dark_theme,
      notifications: data.notifications,
      autoplay: data.autoplay,
      dataSaver: data.data_saver,
      titleLang: data.title_lang,
      defaultStatus: data.default_status,
      accentColor: data.accent_color
    };

    localStorage.setItem('animex_settings_v1', JSON.stringify(settings));
    
    // Update global store
    setState({
      theme: settings.darkTheme ? 'dark' : 'light',
      accentColor: settings.accentColor
    });

    window.dispatchEvent(new CustomEvent('animex:settings-sync', { detail: settings }));
  }
}

export const syncService = new SyncService();
*/
