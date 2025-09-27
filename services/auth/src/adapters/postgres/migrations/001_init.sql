CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES auth.accounts(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES auth.accounts(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES auth.devices(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip TEXT
);

CREATE TABLE IF NOT EXISTS auth.pairing_tokens (
  token UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES auth.accounts(id) ON DELETE CASCADE,
  primary_device_id UUID NOT NULL REFERENCES auth.devices(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  new_device_public_key TEXT,
  pending_display_name TEXT
);

CREATE TABLE IF NOT EXISTS auth.recovery (
  account_id UUID PRIMARY KEY REFERENCES auth.accounts(id) ON DELETE CASCADE,
  rc_hash TEXT NOT NULL,
  params JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.recovery_blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES auth.accounts(id) ON DELETE CASCADE,
  blob_version INTEGER NOT NULL,
  ciphertext BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  associated_data BYTEA NOT NULL,
  salt BYTEA NOT NULL,
  argon_params JSONB NOT NULL,
  profile TEXT NOT NULL,
  cipher_length INTEGER NOT NULL,
  pad_length INTEGER NOT NULL,
  verifier BYTEA,
  kek_verifier BYTEA,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  previous_blob_id UUID,
  size_bytes INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS recovery_blobs_active_account_idx
  ON auth.recovery_blobs(account_id)
  WHERE is_active = TRUE;
