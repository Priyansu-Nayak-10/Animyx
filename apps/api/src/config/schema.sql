-- Animyx 2.0 PostgreSQL schema

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  bio TEXT,
  avatar TEXT,
  banner TEXT,
  mal TEXT,
  al TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dark_theme BOOLEAN DEFAULT true,
  notifications BOOLEAN DEFAULT false,
  autoplay BOOLEAN DEFAULT false,
  data_saver BOOLEAN DEFAULT false,
  title_lang TEXT DEFAULT 'english',
  default_status TEXT DEFAULT 'plan',
  accent_color TEXT DEFAULT '#6366f1',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS followed_anime (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id INT,
  mal_id INT NOT NULL,
  title TEXT,
  status TEXT DEFAULT 'watching',
  next_episode INT DEFAULT 1,
  airing_time TIMESTAMP WITH TIME ZONE,
  is_airing BOOLEAN DEFAULT false,
  total_episodes INT DEFAULT 0,
  last_known_episode INT DEFAULT 0,
  image TEXT,
  user_rating NUMERIC,
  dub_available BOOLEAN DEFAULT false,
  last_checked TIMESTAMP DEFAULT NOW(),
  last_dub_check_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  watchlist_added_at TIMESTAMP WITH TIME ZONE,
  watch_progress_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  rating_updated_at TIMESTAMP WITH TIME ZONE,
  client_id TEXT,
  mutation_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, mal_id)
);

CREATE TABLE IF NOT EXISTS anime_relations_cache (
  mal_id INT PRIMARY KEY,
  sequel_ids INT[],
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anime_follows (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mal_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, mal_id)
);

CREATE TABLE IF NOT EXISTS anime_events (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  mal_id INT NOT NULL,
  message TEXT,
  source_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (type, mal_id, message)
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  mal_id INT,
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_recommendations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendations JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followed_anime_user ON followed_anime(user_id);
CREATE INDEX IF NOT EXISTS idx_followed_anime_mal ON followed_anime(mal_id);
CREATE INDEX IF NOT EXISTS idx_followed_dub_unchecked ON followed_anime(last_dub_check_at) WHERE dub_available = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_mal ON events(mal_id);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_anime_follows_user ON anime_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_anime_follows_mal ON anime_follows(mal_id);
CREATE INDEX IF NOT EXISTS idx_anime_events_type ON anime_events(type);
CREATE INDEX IF NOT EXISTS idx_anime_events_mal ON anime_events(mal_id);
CREATE INDEX IF NOT EXISTS idx_anime_events_created ON anime_events(created_at DESC);

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN anime_id INT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN status TEXT DEFAULT 'watching';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN next_episode INT DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN airing_time TIMESTAMP WITH TIME ZONE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN last_dub_check_at TIMESTAMP DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN user_rating NUMERIC;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN watchlist_added_at TIMESTAMP WITH TIME ZONE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN watch_progress_at TIMESTAMP WITH TIME ZONE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN rating_updated_at TIMESTAMP WITH TIME ZONE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN client_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE followed_anime ADD COLUMN mutation_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE anime_events ADD COLUMN source_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE anime_events DROP CONSTRAINT IF EXISTS anime_events_type_mal_id_key;
  ALTER TABLE anime_events ADD CONSTRAINT anime_events_type_mal_message_key UNIQUE (type, mal_id, message);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cron_locks (
  job_name TEXT PRIMARY KEY,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS job_locks (
  job_name TEXT PRIMARY KEY,
  is_running BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION acquire_job_lock(p_job_name TEXT, p_lock_seconds INT DEFAULT 300)
RETURNS BOOLEAN AS $$
DECLARE
  now_ts TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
  INSERT INTO cron_locks (job_name, locked_at, expires_at)
  VALUES (p_job_name, now_ts, now_ts + make_interval(secs => p_lock_seconds))
  ON CONFLICT (job_name) DO UPDATE
    SET locked_at = EXCLUDED.locked_at,
        expires_at = EXCLUDED.expires_at
  WHERE cron_locks.expires_at < now_ts;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_job_lock(p_job_name TEXT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM cron_locks WHERE job_name = p_job_name;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  ALTER TABLE events DROP CONSTRAINT IF EXISTS unique_event_target;
  ALTER TABLE events ADD CONSTRAINT unique_event_target_message UNIQUE (type, mal_id, message);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
