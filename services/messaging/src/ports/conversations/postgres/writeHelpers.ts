import type {
  ConversationSettings,
  Participant
} from '../../../domain/types/conversation.types';
import type { Actor, IsoDateTime, Uuid } from '../../shared/types';
import type { SqlClient } from '../../shared/sql';
import type { ConversationsWritePort } from '../conversationsWritePort';

export type ParticipantChanges = Parameters<ConversationsWritePort['updateParticipants']>[1];
export type CreateInput = Parameters<ConversationsWritePort['create']>[0];
export type SettingsInput = Parameters<ConversationsWritePort['updateSettings']>[1];
export type MetadataInput = Parameters<ConversationsWritePort['updateMetadata']>[1];

export type AuditRecord = {
  conversationId: Uuid;
  actorId: Uuid;
  action: string;
  occurredAt: IsoDateTime;
  details: Record<string, unknown>;
};

export const defaultSettings: ConversationSettings = {
  whoCanAddParticipants: 'admin',
  whoCanSendMessages: 'member',
  messageRetentionDays: 0,
  e2eeEnabled: true,
  maxParticipants: 0
};

export const ensureCreatorIncluded = (
  participantIds: Uuid[],
  actor: Actor,
  timestamp: IsoDateTime
): Participant[] => {
  const ids = participantIds.includes(actor.id) ? participantIds : [actor.id, ...participantIds];
  return ids.map(userId => ({
    userId,
    role: userId === actor.id ? 'owner' : 'member',
    joinedAt: timestamp,
    muted: false
  }));
};

export const buildAuditRecord = (
  conversationId: Uuid,
  actorId: Uuid,
  action: AuditRecord['action'],
  occurredAt: IsoDateTime,
  details: Record<string, unknown>
): AuditRecord => ({ conversationId, actorId, action, occurredAt, details });

export const recordAudit = (sql: SqlClient, record: AuditRecord) =>
  sql.query(
    `
    insert into messaging.conversation_audit (
      conversation_id,
      actor_id,
      action,
      occurred_at,
      details
    ) values ($1,$2,$3,$4,$5)
  `,
    [record.conversationId, record.actorId, record.action, record.occurredAt, JSON.stringify(record.details)]
  );

export const insertConversation = async (
  sql: SqlClient,
  id: Uuid,
  input: CreateInput,
  timestamp: IsoDateTime
) => {
  await sql.query(
    `
    insert into messaging.conversations (
      id,
      type,
      name,
      description,
      avatar_url,
      settings,
      metadata,
      created_at,
      updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9
    )
  `,
    [
      id,
      input.type,
      input.name ?? null,
      input.description ?? null,
      input.avatarUrl ?? null,
      JSON.stringify(input.settings ?? defaultSettings),
      input.metadata ?? null,
      timestamp,
      timestamp
    ]
  );
};

export const insertParticipants = async (
  sql: SqlClient,
  conversationId: Uuid,
  participants: Participant[]
) => {
  for (const participant of participants) {
    await sql.query(
      `
      insert into messaging.conversation_participants (
        conversation_id,
        user_id,
        role,
        joined_at,
        muted,
        muted_until
      ) values ($1,$2,$3,$4,$5,$6)
    `,
      [
        conversationId,
        participant.userId,
        participant.role,
        participant.joinedAt,
        participant.muted,
        participant.mutedUntil ?? null
      ]
    );
  }
};

const insertNewParticipants = (
  sql: SqlClient,
  conversationId: Uuid,
  additions: ParticipantChanges['add'],
  timestamp: IsoDateTime
) =>
  Promise.all(
    additions.map(addition =>
      sql.query(
        `
        insert into messaging.conversation_participants (
          conversation_id,
          user_id,
          role,
          joined_at,
          muted
        ) values ($1,$2,$3,$4,false)
        on conflict (conversation_id, user_id) do update set
          role = excluded.role,
          joined_at = excluded.joined_at,
          muted = excluded.muted
      `,
        [conversationId, addition.userId, addition.role, timestamp]
      )
    )
  );

const markRemovedParticipants = (
  sql: SqlClient,
  conversationId: Uuid,
  removals: ParticipantChanges['remove'],
  timestamp: IsoDateTime
) => {
  if (!removals?.length) return Promise.resolve();
  return sql.query(
    `
    update messaging.conversation_participants
    set left_at = $3
    where conversation_id = $1 and user_id = any($2)
  `,
    [conversationId, removals, timestamp]
  );
};

const updateParticipantRoles = (
  sql: SqlClient,
  conversationId: Uuid,
  updates: NonNullable<ParticipantChanges['updateRole']>
) =>
  Promise.all(
    updates.map(update =>
      sql.query(
        `
        update messaging.conversation_participants
        set role = $3
        where conversation_id = $1 and user_id = $2
      `,
        [conversationId, update.userId, update.role]
      )
    )
  );

export const applyParticipantChanges = (
  sql: SqlClient,
  conversationId: Uuid,
  changes: ParticipantChanges,
  timestamp: IsoDateTime
) =>
  Promise.all([
    insertNewParticipants(sql, conversationId, changes.add ?? [], timestamp),
    markRemovedParticipants(sql, conversationId, changes.remove ?? [], timestamp),
    updateParticipantRoles(sql, conversationId, changes.updateRole ?? [])
  ]);

export const touchConversation = (sql: SqlClient, id: Uuid, timestamp: IsoDateTime) =>
  sql.query(
    `
    update messaging.conversations
    set updated_at = $2
    where id = $1
  `,
    [id, timestamp]
  );

