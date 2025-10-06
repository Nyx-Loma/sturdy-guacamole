import type { Message } from '../../../domain/types/message.types';
import type { MessageFilter, PageResult, Uuid } from '../../shared/types';
import type { SqlClient } from '../../shared/sql';
import type { MessagesReadPort } from '../messagesReadPort';

export type MessagesReadAdapterDeps = {
  sql: SqlClient;
};

export const createPostgresMessagesReadAdapter = ({ sql }: MessagesReadAdapterDeps): MessagesReadPort => {
  return {
    async findById(id) {
      const result = await sql.query<MessageRow>(
        `
        select *
        from messaging.messages
        where id = $1
        limit 1
      `,
        [id]
      );
      return result.rows[0] ? mapRowToMessage(result.rows[0]) : null;
    },

    async list(filter) {
      const { sqlString, params } = buildQuery(filter);
      const result = await sql.query<MessageRow>(sqlString, params);
      return result.rows.map(mapRowToMessage);
    },

    async count(filter) {
      const { sqlString, params } = buildQuery(filter, { kind: 'count' });
      const result = await sql.query<{ count: string }>(sqlString, params);
      return Number(result.rows[0]?.count ?? 0);
    },

    async listPage(filter, cursor, limit = 50) {
      const { sqlString, params } = buildQuery(filter, { cursor, limit });
      const result = await sql.query<MessageRow>(sqlString, params);

      const items = result.rows.map(mapRowToMessage);
      const nextCursor = items.length === limit ? items[items.length - 1].id : undefined;

      return { items, nextCursor } satisfies PageResult<Message>;
    }
  };
};

type QueryOptions =
  | { kind: 'count' }
  | { cursor?: string; limit: number };

const buildQuery = (
  filter: MessageFilter,
  options?: QueryOptions
) => {
  const where: string[] = [];
  const params: unknown[] = [];

  appendEqualityFilter(where, params, 'conversation_id', filter.conversationId);
  appendEqualityFilter(where, params, 'sender_id', filter.senderId);
  appendEqualityFilter(where, params, 'status', filter.status);
  appendEqualityFilter(where, params, 'type', filter.type);

  if (!filter.includeDeleted) {
    where.push(`deleted_at is null`);
  }

  appendComparisonFilter(where, params, 'created_at <', filter.before);
  appendComparisonFilter(where, params, 'created_at >', filter.after);

  if (options && options.kind === 'count') {
    return {
      sqlString: `select count(*) from messaging.messages ${whereClause(where)}`,
      params
    };
  }

  const cursorClause = buildCursorClause(options?.cursor, params);
  const limitClause = buildLimitClause(options, params);

  const sqlString = `
    select *
    from messaging.messages
    ${whereClause(where, cursorClause)}
    order by created_at desc, id desc
    ${limitClause}
  `;

  return { sqlString, params };
};

const whereClause = (where: string[], additional?: string) => {
  const clauses = [...where];
  if (additional) clauses.push(additional);
  return clauses.length ? `where ${clauses.join(' and ')}` : '';
};

const appendEqualityFilter = (
  where: string[],
  params: unknown[],
  column: string,
  value?: unknown
) => {
  if (value === undefined) return;
  params.push(value);
  where.push(`${column} = $${params.length}`);
};

const appendComparisonFilter = (
  where: string[],
  params: unknown[],
  clause: string,
  value?: unknown
) => {
  if (value === undefined) return;
  params.push(value);
  where.push(`${clause} $${params.length}`);
};

const buildCursorClause = (cursor: string | undefined, params: unknown[]) => {
  if (!cursor) return '';
  params.push(cursor);
  return `(created_at, id) < (select created_at, id from messaging.messages where id = $${params.length})`;
};

const buildLimitClause = (options: QueryOptions | undefined, params: unknown[]) => {
  if (!options || options.kind === 'count') return '';
  params.push(options.limit);
  return `limit $${params.length}`;
};

type MessageRow = {
  id: Uuid;
  conversation_id: Uuid;
  sender_id: Uuid;
  type: string;
  status: string;
  encrypted_content: string;
  metadata: Record<string, unknown> | null;
  content_size: number | null;
  content_mime_type: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  read_at: string | null;
  deleted_at: string | null;
};

const mapRowToMessage = (row: MessageRow): Message => ({
  id: row.id,
  conversationId: row.conversation_id,
  senderId: row.sender_id,
  type: row.type as Message['type'],
  status: row.status as Message['status'],
  seq: row.seq,
  encryptedContent: row.encrypted_content,
  metadata: row.metadata ?? undefined,
  contentSize: row.content_size ?? undefined,
  contentMimeType: row.content_mime_type ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deliveredAt: row.delivered_at ?? undefined,
  readAt: row.read_at ?? undefined,
  deletedAt: row.deleted_at ?? undefined
});

