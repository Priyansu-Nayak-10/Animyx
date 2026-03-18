CREATE TABLE IF NOT EXISTS cron_locks (
    job_name TEXT PRIMARY KEY,
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE OR REPLACE FUNCTION acquire_job_lock(
    p_job_name TEXT,
    p_lock_seconds INT DEFAULT 300
) RETURNS BOOLEAN AS $$
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
          WHEN duplicate_table THEN NULL;
          WHEN others THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION process_anime_event(
    p_type TEXT,
    p_mal_id INT,
    p_message TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_event_id INT;
BEGIN
    INSERT INTO events (type, mal_id, message)
    VALUES (p_type, p_mal_id, p_message)
    ON CONFLICT (type, mal_id, message) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        RETURN FALSE;
    END IF;

    INSERT INTO notifications (user_id, event_id, is_read)
    SELECT DISTINCT u.user_id, v_event_id, false
    FROM (
        SELECT user_id FROM anime_follows WHERE mal_id = p_mal_id
        UNION
        SELECT user_id FROM followed_anime WHERE mal_id = p_mal_id
    ) u;

    RETURN TRUE;
EXCEPTION WHEN unique_violation THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;
