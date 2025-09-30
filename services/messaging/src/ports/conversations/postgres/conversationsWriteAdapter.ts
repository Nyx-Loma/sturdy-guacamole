import { randomUUID } from 'node:crypto';

import type { Actor, IsoDateTime, Uuid } from '../../shared/types';
import { type SqlClient, inTransaction } from '../../shared/sql';
import type { ConversationsWritePort } from '../conversationsWritePort';
import {
  applyParticipantChanges,
  buildAuditRecord,
  ensureCreatorIncluded,
  insertConversation,
  insertParticipants,
  recordAudit,
  touchConversation,
  type ParticipantChanges,
  type CreateInput,
  type SettingsInput,
  type MetadataInput
} from './writeHelpers';

export type ConversationsWriteAdapterDeps = {
  sql: SqlClient;
  now: () => Date;
  generateId?: () => Uuid;
};

export const createPostgresConversationsWriteAdapter = ({
  sql,
  now,
  generateId = () => randomUUID()
}: ConversationsWriteAdapterDeps): ConversationsWritePort => {
  const create: ConversationsWritePort['create'] = (input, actor) =>
    createConversation(sql, now, generateId, input, actor);

  const updateParticipants: ConversationsWritePort['updateParticipants'] = (id, changes, actor) =>
    mutateParticipants(sql, now, id, changes, actor);

  const markRead: ConversationsWritePort['markRead'] = (id, userId, at) =>
    sql.query(
      `
      update messaging.conversation_participants
      set last_read_at = $3
      where conversation_id = $1 and user_id = $2
    `,
      [id, userId, at]
    );

  const updateSettings: ConversationsWritePort['updateSettings'] = (id, settings, actor) =>
    mutateSettings(sql, now, id, settings, actor);

  const updateMetadata: ConversationsWritePort['updateMetadata'] = (id, metadata, actor) =>
    mutateMetadata(sql, now, id, metadata, actor);

  const softDelete: ConversationsWritePort['softDelete'] = (id, at, actor) =>
    mutateSoftDelete(sql, now, id, at, actor);

  return { create, updateParticipants, markRead, updateSettings, updateMetadata, softDelete };
};

const createConversation = async (
  sql: SqlClient,
  now: () => Date,
  generateId: () => Uuid,
  input: CreateInput,
  actor: Actor
) =>
  inTransaction(sql, async client => {
    const timestamp = now().toISOString();
    const id = generateId();
    const participants = ensureCreatorIncluded(input.participantIds, actor, timestamp);

    await insertConversation(client, id, input, timestamp);
    await insertParticipants(client, id, participants);
    await recordAudit(client, buildAuditRecord(id, actor.id, 'created', timestamp, {
      participants: participants.length
    }));

    return id;
  });

const mutateParticipants = (
  sql: SqlClient,
  now: () => Date,
  id: Uuid,
  changes: ParticipantChanges,
  actor: Actor
) =>
  inTransaction(sql, async client => {
    const timestamp = now().toISOString();
    await applyParticipantChanges(client, id, changes, timestamp);
    await touchConversation(client, id, timestamp);
    await recordAudit(
      client,
      buildAuditRecord(id, actor.id, 'participants_updated', timestamp, changes)
    );
  });

const mutateSettings = (
  sql: SqlClient,
  now: () => Date,
  id: Uuid,
  settings: SettingsInput,
  actor: Actor
) => {
  const timestamp = now().toISOString();
  return sql
    .query(
      `
      update messaging.conversations
      set settings = settings || $2::jsonb,
          updated_at = $3
      where id = $1
    `,
      [id, JSON.stringify(settings), timestamp]
    )
    .then(() => recordAudit(sql, buildAuditRecord(id, actor.id, 'settings_updated', timestamp, settings)));
};

const mutateMetadata = (
  sql: SqlClient,
  now: () => Date,
  id: Uuid,
  metadata: MetadataInput,
  actor: Actor
) => {
  const timestamp = now().toISOString();
  return sql
    .query(
      `
      update messaging.conversations
      set name = coalesce($2, name),
          description = coalesce($3, description),
          avatar_url = coalesce($4, avatar_url),
          updated_at = $5
      where id = $1
    `,
      [id, metadata.name ?? null, metadata.description ?? null, metadata.avatarUrl ?? null, timestamp]
    )
    .then(() => recordAudit(sql, buildAuditRecord(id, actor.id, 'metadata_updated', timestamp, metadata)));
};

const mutateSoftDelete = (
  sql: SqlClient,
  now: () => Date,
  id: Uuid,
  at: IsoDateTime,
  actor: Actor
) => {
  const timestamp = now().toISOString();
  return sql
    .query(
      `
      update messaging.conversations
      set deleted_at = $2,
          updated_at = $3
      where id = $1
    `,
      [id, at, timestamp]
    )
    .then(() => recordAudit(sql, buildAuditRecord(id, actor.id, 'soft_deleted', at, {})));
};

