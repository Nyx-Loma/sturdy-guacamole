-- Migration: Relax DLQ UUID constraints to accept parse error fallback values
-- Author: System
-- Date: 2025-10-03
-- Reason: Parse errors may not have valid UUIDs, need to store them for forensics

-- Change event_id and aggregate_id from UUID to TEXT in message_dlq
-- This allows us to store fallback values like 'parse_error_<redisId>' or 'json_parse_error_<redisId>'

ALTER TABLE messaging.message_dlq 
  ALTER COLUMN event_id TYPE TEXT USING event_id::TEXT;

ALTER TABLE messaging.message_dlq 
  ALTER COLUMN aggregate_id TYPE TEXT USING aggregate_id::TEXT;

-- Add unique constraint on event_id for ON CONFLICT upsert
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_dlq_event_id 
  ON messaging.message_dlq (event_id);

-- Update comment to reflect schema change
COMMENT ON TABLE messaging.message_dlq IS 'Dead letter queue for messages that failed processing. event_id and aggregate_id are TEXT to allow fallback values for parse errors.';

