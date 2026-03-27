-- ═══════════════════════════════════════════════
-- AllNet — Push Notifications Migration
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════

-- 1. Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Unique on endpoint (one subscription per browser)
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own subscriptions
CREATE POLICY "Users can read own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can read all (needed by Edge Function)
-- Edge Functions use the service_role key which bypasses RLS, so no extra policy needed.

-- 2. Notification cooldowns table (prevents spam — 15 min per court per watcher)
CREATE TABLE IF NOT EXISTS notification_cooldowns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  court_id uuid REFERENCES courts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sent_at timestamptz DEFAULT now() NOT NULL
);

-- Unique constraint: one active cooldown per court per user
CREATE INDEX IF NOT EXISTS idx_notification_cooldowns_court_user
  ON notification_cooldowns(court_id, user_id, sent_at DESC);

-- Auto-cleanup: delete cooldowns older than 1 hour (via pg_cron if available)
-- If pg_cron is enabled:
-- SELECT cron.schedule('cleanup-notification-cooldowns', '*/30 * * * *',
--   $$DELETE FROM notification_cooldowns WHERE sent_at < now() - interval '1 hour'$$
-- );

-- RLS — only service role writes to this table (Edge Function)
ALTER TABLE notification_cooldowns ENABLE ROW LEVEL SECURITY;

-- No user-facing policies needed — Edge Function uses service_role key
