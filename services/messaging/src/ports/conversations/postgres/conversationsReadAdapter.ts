import type { Conversation, Participant } from '../../../domain/types/conversation.types';
import type { ConversationFilter, PageResult, Uuid } from '../../shared/types';
import type { SqlClient } from '../../shared/sql';
import type { ConversationsReadPort } from '../conversationsReadPort';

export type ConversationsReadAdapterDeps = {
  sql: SqlClient;
};

export const createPostgresConversationsReadAdapter = ({ sql }: ConversationsReadAdapterDeps): ConversationsReadPort => {
  return {
    async findById(id) {
      const conversation = await getConversation(sql, id);
      if (!conversation) return null;
      const participants = await listParticipants(sql, id);
      return { ...conversation, participants } satisfies Conversation;
    },

    async list(filter) {
      const { sqlString, params } = buildQuery(filter);
      const result = await sql.query<ConversationRow>(sqlString, params);
      return Promise.all(
        result.rows.map(async row => ({
          ...mapConversationRow(row),
          participants: await listParticipants(sql, row.id)
        }))
      );
    },

    async listPage(filter, cursor, limit = 50) {
      const { sqlString, params } = buildQuery(filter, { cursor, limit });
      const result = await sql.query<ConversationRow>(sqlString, params);

      const items = await Promise.all(
        result.rows.map(async row => ({
          ...mapConversationRow(row),
          participants: await listParticipants(sql, row.id)
        }))
      );

      const nextCursor = items.length === limit ? items[items.length - 1].id : undefined;

      return { items, nextCursor } satisfies PageResult<Conversation>;
    }
  };
};

type QueryOptions = { cursor?: string; limit: number };

const buildQuery = (filter: ConversationFilter, options?: QueryOptions) => {
  const where: string[] = [];
  const params: unknown[] = [];

  addTypeFilter(where, params, filter.type);
  addDeletedFilter(where, filter.includeDeleted);
  addParticipantFilter(where, params, filter.participantId);
  addCursorFilter(where, params, options?.cursor);
  addLimit(options, params);

  const sqlString = `
    select *
    from messaging.conversations
    ${where.length ? `where ${where.join(' and ')}` : ''}
    order by coalesce(last_message_at, updated_at) desc
    ${options && 'limit' in options ? `limit $${params.length}` : ''}
  `;

  return { sqlString, params };
};

const addTypeFilter = (where: string[], params: unknown[], type?: ConversationFilter['type']) => {
  if (!type) return;
  params.push(type);
  where.push(`type = $${params.length}`);
};

const addDeletedFilter = (where: string[], includeDeleted?: boolean) => {
  if (includeDeleted) return;
  if (!where.some(clause => clause.includes('deleted_at'))) {
    where.push('deleted_at is null');
  }
};

const addParticipantFilter = (where: string[], params: unknown[], participantId?: ConversationFilter['participantId']) => {
  if (!participantId) return;
  params.push(participantId);
  where.push(`exists (
    select 1
    from messaging.conversation_participants cp
    where cp.conversation_id = conversations.id
      and cp.user_id = $${params.length}
      and cp.left_at is null
  )`);
};

const addCursorFilter = (where: string[], params: unknown[], cursor?: string) => {
  if (!cursor) return;
  params.push(cursor);
  where.push(`updated_at < (select updated_at from messaging.conversations where id = $${params.length})`);
};

const addLimit = (options: QueryOptions | undefined, params: unknown[]) => {
  if (!options || !('limit' in options)) return;
  params.push(options.limit);
};

const getConversation = async (sql: SqlClient, id: Uuid) => {
  const result = await sql.query<ConversationRow>(
    `
    select *
    from messaging.conversations
    where id = $1
  `,
    [id]
  );
  return result.rows[0] ? mapConversationRow(result.rows[0]) : null;
};

const listParticipants = async (sql: SqlClient, conversationId: Uuid) => {
  const result = await sql.query<ParticipantRow>(
    `
    select *
    from messaging.conversation_participants
    where conversation_id = $1
  `,
    [conversationId]
  );
  return result.rows.map(mapParticipantRow);
};

type ConversationRow = {
  id: Uuid;
  type: string;
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_message_id: Uuid | null;
  last_message_at: string | null;
  last_message_preview: string | null;
};

const mapConversationRow = (row: ConversationRow): Omit<Conversation, 'participants'> => ({
  id: row.id,
  type: row.type as Conversation['type'],
  name: row.name ?? undefined,
  description: row.description ?? undefined,
  avatarUrl: row.avatar_url ?? undefined,
  settings: row.settings as Conversation['settings'],
  metadata: row.metadata ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at ?? undefined,
  lastMessageId: row.last_message_id ?? undefined,
  lastMessageAt: row.last_message_at ?? undefined,
  lastMessagePreview: row.last_message_preview ?? undefined
});

type ParticipantRow = {
  conversation_id: Uuid;
  user_id: Uuid;
  role: string;
  joined_at: string;
  left_at: string | null;
  last_read_at: string | null;
  muted: boolean;
  muted_until: string | null;
};

const mapParticipantRow = (row: ParticipantRow): Participant => ({
  userId: row.user_id,
  role: row.role as Participant['role'],
  joinedAt: row.joined_at,
  leftAt: row.left_at ?? undefined,
  lastReadAt: row.last_read_at ?? undefined,
  muted: row.muted,
  mutedUntil: row.muted_until ?? undefined
});

