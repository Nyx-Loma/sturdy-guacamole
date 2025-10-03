ALTER TABLE messaging.messages
  ADD COLUMN IF NOT EXISTS seq BIGINT;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at, id) AS seq_val
    FROM messaging.messages
)
UPDATE messaging.messages m
   SET seq = ranked.seq_val
  FROM ranked
 WHERE m.id = ranked.id
   AND (m.seq IS NULL OR m.seq = 0);

ALTER TABLE messaging.messages
  ALTER COLUMN seq SET NOT NULL;

ALTER TABLE messaging.conversations
  ADD COLUMN IF NOT EXISTS last_seq BIGINT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_conversation_seq
  ON messaging.messages (conversation_id, seq);

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_dedupe_key
  ON messaging.messages (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS messaging.message_outbox (
  id            BIGSERIAL PRIMARY KEY,
  event_id      UUID        NOT NULL,
  message_id    UUID        NOT NULL,
  event_type    TEXT        NOT NULL,
  aggregate_id  UUID        NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload       JSONB       NOT NULL,
  dedupe_key    TEXT,
  dispatched_at TIMESTAMPTZ,
  ack_at        TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'picked', 'sent', 'dead')),
  attempts      INT         NOT NULL DEFAULT 0,
  last_error    TEXT,
  picked_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_message_outbox_status_created
  ON messaging.message_outbox (status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_message_outbox_aggregate
  ON messaging.message_outbox (aggregate_id, status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_outbox_message_id
  ON messaging.message_outbox (message_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_outbox_dedupe_key
  ON messaging.message_outbox (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS messaging.message_dlq (
  id            BIGSERIAL PRIMARY KEY,
  source_stream TEXT        NOT NULL,
  group_name    TEXT        NOT NULL,
  event_id      UUID        NOT NULL,
  aggregate_id  UUID        NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  payload       JSONB       NOT NULL,
  reason        TEXT        NOT NULL,
  attempts      INT         NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_dlq_aggregate
  ON messaging.message_dlq (aggregate_id, last_seen_at DESC);

CREATE OR REPLACE PROCEDURE messaging.prune_message_outbox(retention INTERVAL)
LANGUAGE SQL
AS $$
  DELETE FROM messaging.message_outbox
   WHERE status IN ('sent', 'dead')
     AND occurred_at < NOW() - retention;
$$;

CREATE OR REPLACE PROCEDURE messaging.prune_message_dlq(retention INTERVAL)
LANGUAGE SQL
AS $$
  DELETE FROM messaging.message_dlq
   WHERE last_seen_at < NOW() - retention;
$$;
