create schema if not exists messaging;
create extension if not exists pgcrypto;

create table if not exists messaging.messages (
  id uuid primary key,
  conversation_id uuid not null,
  sender_id uuid not null,
  type text not null,
  status text not null,
  encrypted_content text not null,
  metadata jsonb,
  content_size integer,
  content_mime_type text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  delivered_at timestamptz,
  read_at timestamptz,
  deleted_at timestamptz
);

create table if not exists messaging.message_idempotency (
  sender_id uuid not null,
  key text not null,
  message_id uuid not null,
  created_at timestamptz not null,
  primary key (sender_id, key)
);

create table if not exists messaging.conversations (
  id uuid primary key,
  type text not null,
  name text,
  description text,
  avatar_url text,
  settings jsonb not null,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  last_message_id uuid,
  last_message_at timestamptz,
  last_message_preview text
);

create table if not exists messaging.conversation_participants (
  conversation_id uuid not null,
  user_id uuid not null,
  role text not null,
  joined_at timestamptz not null,
  left_at timestamptz,
  last_read_at timestamptz,
  muted boolean not null default false,
  muted_until timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists messaging.conversation_audit (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  actor_id uuid not null,
  action text not null,
  occurred_at timestamptz not null,
  details jsonb not null
);

