-- Extend announcement_status enum to support cron job lifecycle states
-- Required by scheduled-announcements cron task
-- 'sending' = picked up by cron, being processed (optimistic lock prevents double-send)
-- 'failed'  = cron or send-announcement task threw an error, visible in dead-letter view
ALTER TYPE announcement_status ADD VALUE IF NOT EXISTS 'sending';
ALTER TYPE announcement_status ADD VALUE IF NOT EXISTS 'failed';
