-- ============================================================
--  Animyx 2.0 — User Profiles & Settings Sync
--  Run this script in the Supabase SQL Editor.
-- ============================================================

-- ── USER PROFILES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT,
  bio         TEXT,
  avatar      TEXT,
  banner      TEXT,
  mal         TEXT,
  al          TEXT,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── USER SETTINGS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dark_theme      BOOLEAN DEFAULT true,
  notifications   BOOLEAN DEFAULT false,
  autoplay        BOOLEAN DEFAULT false,
  data_saver      BOOLEAN DEFAULT false,
  title_lang      TEXT DEFAULT 'english',
  default_status  TEXT DEFAULT 'plan',
  accent_color    TEXT DEFAULT '#6366f1',
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: The Express Backend handles the upsert logic.
