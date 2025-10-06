-- Seed data for messaging service load testing
-- Run with: psql postgres://user:password@localhost:5433/arqivo -f scripts/seed-load-test.sql

-- Clean up existing test data
DELETE FROM messaging.conversation_audit WHERE conversation_id IN (
  SELECT id FROM messaging.conversations WHERE name = 'Load Test Conversation'
);
DELETE FROM messaging.conversation_participants WHERE conversation_id IN (
  SELECT id FROM messaging.conversations WHERE name = 'Load Test Conversation'
);
DELETE FROM messaging.messages WHERE conversation_id IN (
  SELECT id FROM messaging.conversations WHERE name = 'Load Test Conversation'
);
DELETE FROM messaging.conversations WHERE name = 'Load Test Conversation';

-- Create test user IDs (consistent for load testing)
\set test_user_id '\'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\''
\set test_participant_id '\'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\''
\set test_conv_id '\'cccccccc-cccc-cccc-cccc-cccccccccccc\''

-- Create conversation
INSERT INTO messaging.conversations (id, type, name, settings, created_at, updated_at)
VALUES (
  :test_conv_id,
  'group',
  'Load Test Conversation',
  '{}',
  NOW(),
  NOW()
);

-- Add participants
INSERT INTO messaging.conversation_participants (conversation_id, user_id, role, joined_at)
VALUES 
  (:test_conv_id, :test_user_id, 'admin', NOW()),
  (:test_conv_id, :test_participant_id, 'member', NOW());

-- Add audit record
INSERT INTO messaging.conversation_audit (conversation_id, actor_id, action, occurred_at, details)
VALUES (
  :test_conv_id,
  :test_user_id,
  'created',
  NOW(),
  '{"type": "group"}'::jsonb
);

-- Output the IDs for use in k6 scripts
\echo '✅ Load test data seeded successfully!'
\echo ''
\echo 'User ID (SENDER_ID):       aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\echo 'Conversation ID (CONV_ID): cccccccc-cccc-cccc-cccc-cccccccccccc'
\echo ''
\echo 'Next: Generate JWT token with Node.js script'
