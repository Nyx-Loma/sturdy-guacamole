-- Migration: Stage 3A - Conversation CRUD with RLS
-- Date: 2025-10-03
-- Purpose: Add versioning, RLS policies, and constraints for GA-ready conversation management

-- ============================================================================
-- 1. Add version column and metadata enhancements
-- ============================================================================

ALTER TABLE messaging.conversations 
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE messaging.conversations 
  ADD COLUMN IF NOT EXISTS creator_id UUID;

ALTER TABLE messaging.conversations 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add index for pagination
CREATE INDEX IF NOT EXISTS conversations_updated_pagination 
  ON messaging.conversations (updated_at DESC, id);

-- Add index for type filtering
CREATE INDEX IF NOT EXISTS conversations_type_idx 
  ON messaging.conversations (type);

-- Add index for non-deleted conversations
CREATE INDEX IF NOT EXISTS conversations_active_idx 
  ON messaging.conversations (id) 
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. Version bump trigger for optimistic concurrency
-- ============================================================================

CREATE OR REPLACE FUNCTION bump_conversation_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only bump version if metadata changed
  IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN
    NEW.version = OLD.version + 1;
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conversations_version_trigger ON messaging.conversations;
CREATE TRIGGER conversations_version_trigger
  BEFORE UPDATE ON messaging.conversations
  FOR EACH ROW
  EXECUTE FUNCTION bump_conversation_version();

-- ============================================================================
-- 3. Enhance participants table for Stage 3B
-- ============================================================================

ALTER TABLE messaging.participants 
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- Unique constraint: one active membership per user per conversation
CREATE UNIQUE INDEX IF NOT EXISTS participants_unique_active 
  ON messaging.participants (conversation_id, user_id) 
  WHERE left_at IS NULL;

-- Partial index for active participants (performance)
CREATE INDEX IF NOT EXISTS participants_active_conv 
  ON messaging.participants (conversation_id) 
  WHERE left_at IS NULL;

-- Index for pagination
CREATE INDEX IF NOT EXISTS participants_pagination 
  ON messaging.participants (conversation_id, joined_at, user_id) 
  WHERE left_at IS NULL;

-- ============================================================================
-- 4. Direct conversation de-duplication constraint
-- ============================================================================

-- For direct conversations, ensure uniqueness by participant pair
-- We'll use a computed column approach with participants stored in array
-- This requires a custom unique constraint via a function

CREATE OR REPLACE FUNCTION get_direct_conversation_key(conv_id UUID)
RETURNS TEXT AS $$
DECLARE
  user_ids UUID[];
  sorted_ids UUID[];
BEGIN
  -- Get participant user_ids for this conversation
  SELECT ARRAY_AGG(user_id ORDER BY user_id) INTO user_ids
  FROM messaging.participants
  WHERE conversation_id = conv_id AND left_at IS NULL;
  
  -- For direct conversations, we expect exactly 2 participants
  IF array_length(user_ids, 1) = 2 THEN
    RETURN user_ids[1]::TEXT || '|' || user_ids[2]::TEXT;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Note: The direct conversation uniqueness will be enforced at application level
-- via participants table lookups, as it requires join logic
-- Migration adds helper function for future use

-- ============================================================================
-- 5. Row-Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on conversations
ALTER TABLE messaging.conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS conversations_read_policy ON messaging.conversations;
DROP POLICY IF EXISTS conversations_write_policy ON messaging.conversations;
DROP POLICY IF EXISTS conversations_delete_policy ON messaging.conversations;

-- Read policy: can see if you're an active participant
CREATE POLICY conversations_read_policy ON messaging.conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM messaging.participants p 
      WHERE p.conversation_id = conversations.id 
        AND p.user_id = current_setting('app.current_user_id', true)::uuid
        AND p.left_at IS NULL
    )
  );

-- Write policy: only creator or admins can modify
CREATE POLICY conversations_write_policy ON messaging.conversations
  FOR UPDATE
  USING (
    creator_id = current_setting('app.current_user_id', true)::uuid
    OR EXISTS (
      SELECT 1 
      FROM messaging.participants p 
      WHERE p.conversation_id = conversations.id 
        AND p.user_id = current_setting('app.current_user_id', true)::uuid
        AND p.role = 'admin'
        AND p.left_at IS NULL
    )
  );

-- Delete policy: only creator or admins (soft delete)
CREATE POLICY conversations_delete_policy ON messaging.conversations
  FOR UPDATE
  USING (
    (creator_id = current_setting('app.current_user_id', true)::uuid
     OR EXISTS (
       SELECT 1 
       FROM messaging.participants p 
       WHERE p.conversation_id = conversations.id 
         AND p.user_id = current_setting('app.current_user_id', true)::uuid
         AND p.role = 'admin'
         AND p.left_at IS NULL
     ))
    AND deleted_at IS NOT NULL  -- Only allow soft delete updates
  );

-- Insert policy: anyone can create (participants added separately)
CREATE POLICY conversations_insert_policy ON messaging.conversations
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 6. Enable RLS on participants table
-- ============================================================================

ALTER TABLE messaging.participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS participants_read_policy ON messaging.participants;
DROP POLICY IF EXISTS participants_write_policy ON messaging.participants;

-- Read policy: can see participants if you're a participant
CREATE POLICY participants_read_policy ON messaging.participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM messaging.participants p2 
      WHERE p2.conversation_id = participants.conversation_id 
        AND p2.user_id = current_setting('app.current_user_id', true)::uuid
        AND p2.left_at IS NULL
    )
  );

-- Write policy: only admins can add/remove participants
CREATE POLICY participants_write_policy ON messaging.participants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 
      FROM messaging.participants p 
      WHERE p.conversation_id = participants.conversation_id 
        AND p.user_id = current_setting('app.current_user_id', true)::uuid
        AND (p.role = 'admin' OR p.user_id = participants.user_id)
        AND p.left_at IS NULL
    )
  );

-- ============================================================================
-- 7. Comments for documentation
-- ============================================================================

COMMENT ON COLUMN messaging.conversations.version IS 'Optimistic concurrency version, auto-incremented on metadata updates';
COMMENT ON COLUMN messaging.conversations.creator_id IS 'User who created the conversation, has admin privileges';
COMMENT ON COLUMN messaging.conversations.deleted_at IS 'Soft delete timestamp, NULL means active';

COMMENT ON COLUMN messaging.participants.left_at IS 'When participant left, NULL means active';

COMMENT ON FUNCTION bump_conversation_version() IS 'Auto-increment version on metadata changes for optimistic concurrency control';
COMMENT ON FUNCTION get_direct_conversation_key(UUID) IS 'Helper to compute unique key for direct conversations based on sorted participant user_ids';

