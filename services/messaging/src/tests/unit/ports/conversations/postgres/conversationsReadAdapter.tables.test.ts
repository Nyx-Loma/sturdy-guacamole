import { describe, expect, test, vi } from 'vitest';

import { createPostgresConversationsReadAdapter } from '../../../../../ports/conversations/postgres/conversationsReadAdapter';

type QueryCall = { sql: string; params?: unknown[] };

const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

const createSqlMock = (responses: Array<{ rows: any[] }> = []) => {
  const calls: QueryCall[] = [];
  const queue = [...responses];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const result = queue.shift();
    return result ?? { rows: [] };
  });
  return { sql: { query }, calls } as const;
};

const conversationRow = (overrides: Record<string, unknown> = {}) => ({
  id: '07a6b832-8c72-4f5d-947b-314becaa7c1c',
  type: 'group',
  name: 'Team',
  description: 'Desc',
  avatar_url: null,
  settings: { whoCanAddParticipants: 'admin' },
  metadata: null,
  created_at: '2025-09-29T12:00:00.000Z',
  updated_at: '2025-09-29T12:00:00.000Z',
  deleted_at: null,
  last_message_id: null,
  last_message_at: null,
  last_message_preview: null,
  ...overrides
});

const participantRow = (overrides: Record<string, unknown> = {}) => ({
  conversation_id: '07a6b832-8c72-4f5d-947b-314becaa7c1c',
  user_id: 'c5f7502b-3c7c-4b5d-ae26-6f8733a71278',
  role: 'member',
  joined_at: '2025-09-29T12:00:00.000Z',
  left_at: null,
  last_read_at: null,
  muted: false,
  muted_until: null,
  ...overrides
});

describe('PostgresConversationsReadAdapter.findById()', () => {
  test('returns conversation with participants', async () => {
    const rows = [conversationRow({ id: 'conv-id' })];
    const participants = [participantRow({ conversation_id: 'conv-id', user_id: 'owner', role: 'owner' })];
    const { sql, calls } = createSqlMock([{ rows }, { rows: participants }]);
    const adapter = createPostgresConversationsReadAdapter({ sql });

    const conversation = await adapter.findById('conv-id');

    expect(conversation?.id).toBe('conv-id');
    expect(conversation?.participants).toHaveLength(1);
    expect(calls[0].params).toEqual(['conv-id']);
  });

  test('returns null when conversation missing', async () => {
    const { sql } = createSqlMock([{ rows: [] }]);
    const adapter = createPostgresConversationsReadAdapter({ sql });

    expect(await adapter.findById('missing')).toBeNull();
  });
});

describe('PostgresConversationsReadAdapter.list()', () => {
  test('applies filters and loads participants', async () => {
    const rows = [conversationRow({ id: 'conv-1' }), conversationRow({ id: 'conv-2' })];
    const participants = [participantRow({ conversation_id: 'conv-1', user_id: 'owner-1', role: 'owner' })];
    const moreParticipants = [participantRow({ conversation_id: 'conv-2', user_id: 'owner-2', role: 'owner' })];
    const { sql, calls } = createSqlMock([{ rows }, { rows: participants }, { rows: moreParticipants }]);
    const adapter = createPostgresConversationsReadAdapter({ sql });

    const list = await adapter.list({ type: 'group', participantId: 'owner-1' });

    expect(list).toHaveLength(2);
    expect(list.every(item => Array.isArray(item.participants))).toBe(true);
    const normalized = normalizeSql(calls[0].sql);
    expect(normalized).toContain('type = $1');
    expect(normalized).toContain('exists');
  });

  test('excludes deleted conversations by default', async () => {
    const { sql, calls } = createSqlMock([{ rows: [] }]);
    const adapter = createPostgresConversationsReadAdapter({ sql });

    await adapter.list({});

    const normalized = normalizeSql(calls[0].sql);
    expect(normalized).toContain('deleted_at is null');
  });

  test('includes deleted when requested', async () => {
    const { sql, calls } = createSqlMock([{ rows: [] }]);
    const adapter = createPostgresConversationsReadAdapter({ sql });

    await adapter.list({ includeDeleted: true });

    const normalized = normalizeSql(calls[0].sql);
    expect(normalized).not.toContain('deleted_at is null');
  });
});

describe('PostgresConversationsReadAdapter.listPage()', () => {
  test('returns page and next cursor', async () => {
    const rows = [conversationRow({ id: 'conv-a' }), conversationRow({ id: 'conv-b' })];
    const participants = [participantRow({ conversation_id: 'conv-a', user_id: 'owner-a', role: 'owner' })];
    const moreParticipants = [participantRow({ conversation_id: 'conv-b', user_id: 'owner-b', role: 'owner' })];
    const { sql, calls } = createSqlMock([{ rows }, { rows: participants }, { rows: moreParticipants }]);
    const adapter = createPostgresConversationsReadAdapter({ sql });

    const page = await adapter.listPage({ participantId: 'owner-a' }, 'cursor-id', 2);

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('conv-b');
    expect(calls[0].params).toEqual(['owner-a', 'cursor-id', 2]);
  });

  test('last page omits next cursor', async () => {
    const rows = [conversationRow({ id: 'conv-only' })];
    const participants = [participantRow({ conversation_id: 'conv-only', user_id: 'owner', role: 'owner' })];
    const { sql } = createSqlMock([{ rows }, { rows: participants }]);
    const adapter = createPostgresConversationsReadAdapter({ sql });

    const page = await adapter.listPage({}, undefined, 10);

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeUndefined();
  });
});

