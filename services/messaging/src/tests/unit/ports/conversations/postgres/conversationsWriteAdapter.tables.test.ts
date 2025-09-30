import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createPostgresConversationsWriteAdapter } from '../../../../../ports/conversations/postgres/conversationsWriteAdapter';

type QueryCall = { sql: string; params?: unknown[] };

const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

const baseNow = () => new Date('2025-09-29T12:00:00.000Z');

const createSqlMock = (handlers: Record<string, (params?: unknown[]) => { rows?: unknown[] } | Promise<{ rows?: unknown[] }> | void> = {}) => {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const handler = handlers[normalizeSql(sql)];
    if (handler) {
      const result = await handler(params);
      return result ?? { rows: [] };
    }
    return { rows: [] };
  });
  return { sql: { query }, calls } as const;
};

const participant = (overrides: Partial<{ userId: string; role: string }> = {}) => ({
  userId: overrides.userId ?? '1e9848f0-8ef3-486e-9d3d-6bde8462c7ec',
  role: overrides.role ?? 'member'
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PostgresConversationsWriteAdapter.create()', () => {
  const baseInput = {
    type: 'group' as const,
    participantIds: ['1e9848f0-8ef3-486e-9d3d-6bde8462c7ec', '8cd8dc66-0f46-4fed-87ec-dc8700b34e39'],
    name: 'Team',
    description: 'Group chat',
    avatarUrl: 'https://example.com/avatar.png',
    settings: {
      whoCanAddParticipants: 'admin',
      whoCanSendMessages: 'member',
      messageRetentionDays: 0,
      e2eeEnabled: true,
      maxParticipants: 0
    },
    metadata: { topic: 'launch' }
  };

  const scenarios = [
    { name: 'default group', input: baseInput },
    { name: 'with custom metadata', input: { ...baseInput, metadata: { topic: 'ops', priority: 'high' } } },
    { name: 'with settings overrides', input: { ...baseInput, settings: { ...baseInput.settings, whoCanAddParticipants: 'owner' } } },
    { name: 'direct conversation includes participants automatically', input: { ...baseInput, type: 'direct' as const, name: undefined, description: undefined } },
    { name: 'broadcast conversation', input: { ...baseInput, type: 'channel' as const } }
  ];

  test.each(scenarios)('creates conversation for %s', async ({ input }) => {
    const handlers = {
      [normalizeSql('insert into messaging.conversations ( id, type, name, description, avatar_url, settings, metadata, created_at, updated_at ) values ( $1,$2,$3,$4,$5,$6,$7,$8,$9 )')]: vi.fn(),
      [normalizeSql('insert into messaging.conversation_participants ( conversation_id, user_id, role, joined_at, muted, muted_until ) values ($1,$2,$3,$4,$5,$6)')]: vi.fn(),
      [normalizeSql('insert into messaging.conversation_audit ( conversation_id, actor_id, action, occurred_at, details ) values ($1,$2,$3,$4,$5)')]: vi.fn()
    };

    const { sql, calls } = createSqlMock(handlers);
    const adapter = createPostgresConversationsWriteAdapter({ sql, now: baseNow });

    const actor = { id: 'ce532761-2b59-4e93-90c5-5d025a4d8f6d', role: 'user' as const };
    const id = await adapter.create(input, actor);

    expect(typeof id).toBe('string');
    expect(sql.query).toHaveBeenCalled();

    const insertConversationCall = calls.find(call => normalizeSql(call.sql).includes('insert into messaging.conversations'));
    expect(insertConversationCall).toBeDefined();
    expect(insertConversationCall?.params?.[1]).toBe(input.type);

    const participantCalls = calls.filter(call => normalizeSql(call.sql).includes('insert into messaging.conversation_participants'));
    expect(participantCalls.length).toBeGreaterThanOrEqual(input.participantIds.length + 1);

    const auditCall = calls.find(call => normalizeSql(call.sql).includes('insert into messaging.conversation_audit'));
    expect(auditCall).toBeDefined();
    expect(auditCall?.params?.[2]).toBe('created');
  });
});

describe('PostgresConversationsWriteAdapter.updateParticipants()', () => {
  test('adds and removes participants with audit entry', async () => {
    const updateHandlers = {
      [normalizeSql('insert into messaging.conversation_participants ( conversation_id, user_id, role, joined_at, muted ) values ($1,$2,$3,$4,false) on conflict (conversation_id, user_id) do update set role = excluded.role, joined_at = excluded.joined_at, muted = excluded.muted')]: vi.fn(),
      [normalizeSql('update messaging.conversation_participants set left_at = $3 where conversation_id = $1 and user_id = any($2)')]: vi.fn(),
      [normalizeSql('update messaging.conversation_participants set role = $3 where conversation_id = $1 and user_id = $2')]: vi.fn(),
      [normalizeSql('update messaging.conversations set updated_at = $2 where id = $1')]: vi.fn(),
      [normalizeSql('insert into messaging.conversation_audit ( conversation_id, actor_id, action, occurred_at, details ) values ($1,$2,$3,$4,$5)')]: vi.fn()
    };

    const { sql, calls } = createSqlMock(updateHandlers);
    const adapter = createPostgresConversationsWriteAdapter({ sql, now: baseNow });

    await adapter.updateParticipants(
      'ef24d935-9fd4-41ca-9485-cc07b44ef6fc',
      {
        add: [participant({ userId: 'e4a7fb40-3234-460f-8764-ba309ebb8bf8', role: 'member' })],
        remove: ['7b886735-d1d5-4239-9f21-31f99f67b7d7'],
        updateRole: [participant({ userId: '1e9848f0-8ef3-486e-9d3d-6bde8462c7ec', role: 'admin' })]
      },
      { id: 'ce532761-2b59-4e93-90c5-5d025a4d8f6d', role: 'user' as const }
    );

    const normalizedCalls = calls.map(call => normalizeSql(call.sql));
    expect(normalizedCalls.some(sql => sql.includes('insert into messaging.conversation_participants'))).toBe(true);
    expect(normalizedCalls.some(sql => sql.includes('update messaging.conversation_participants set left_at'))).toBe(true);
    expect(normalizedCalls.some(sql => sql.includes('update messaging.conversations set updated_at'))).toBe(true);
    expect(normalizedCalls.some(sql => sql.includes('insert into messaging.conversation_audit'))).toBe(true);
  });
});

describe('PostgresConversationsWriteAdapter.updateMetadata()', () => {
  test('updates metadata and records audit', async () => {
    const handlers = {
      [normalizeSql('update messaging.conversations set name = coalesce($2, name), description = coalesce($3, description), avatar_url = coalesce($4, avatar_url), updated_at = $5 where id = $1')]: vi.fn(),
      [normalizeSql('insert into messaging.conversation_audit ( conversation_id, actor_id, action, occurred_at, details ) values ($1,$2,$3,$4,$5)')]: vi.fn()
    };

    const { sql, calls } = createSqlMock(handlers);
    const adapter = createPostgresConversationsWriteAdapter({ sql, now: baseNow });

    await adapter.updateMetadata(
      'ef24d935-9fd4-41ca-9485-cc07b44ef6fc',
      { name: 'New Name', description: 'New description' },
      { id: 'ce532761-2b59-4e93-90c5-5d025a4d8f6d', role: 'user' as const }
    );

    expect(calls.some(call => normalizeSql(call.sql).includes('update messaging.conversations set name = coalesce'))).toBe(true);
    expect(calls.some(call => normalizeSql(call.sql).includes('insert into messaging.conversation_audit'))).toBe(true);
  });
});

describe('PostgresConversationsWriteAdapter.updateSettings()', () => {
  test('updates settings and records audit', async () => {
    const handlers = {
      [normalizeSql('update messaging.conversations set settings = settings || $2::jsonb, updated_at = $3 where id = $1')]: vi.fn(),
      [normalizeSql('insert into messaging.conversation_audit ( conversation_id, actor_id, action, occurred_at, details ) values ($1,$2,$3,$4,$5)')]: vi.fn()
    };

    const { sql, calls } = createSqlMock(handlers);
    const adapter = createPostgresConversationsWriteAdapter({ sql, now: baseNow });

    await adapter.updateSettings(
      'ef24d935-9fd4-41ca-9485-cc07b44ef6fc',
      { whoCanAddParticipants: 'owner' },
      { id: 'ce532761-2b59-4e93-90c5-5d025a4d8f6d', role: 'user' as const }
    );

    expect(calls.some(call => normalizeSql(call.sql).includes('settings = settings ||'))).toBe(true);
    expect(calls.some(call => normalizeSql(call.sql).includes('insert into messaging.conversation_audit'))).toBe(true);
  });
});

describe('PostgresConversationsWriteAdapter.softDelete()', () => {
  test('marks conversation as deleted with audit entry', async () => {
    const handlers = {
      [normalizeSql('update messaging.conversations set deleted_at = $2, updated_at = $3 where id = $1')]: vi.fn(),
      [normalizeSql('insert into messaging.conversation_audit ( conversation_id, actor_id, action, occurred_at, details ) values ($1,$2,$3,$4,$5)')]: vi.fn()
    };

    const { sql, calls } = createSqlMock(handlers);
    const adapter = createPostgresConversationsWriteAdapter({ sql, now: baseNow });

    await adapter.softDelete(
      'ef24d935-9fd4-41ca-9485-cc07b44ef6fc',
      '2025-09-29T13:00:00.000Z',
      { id: 'ce532761-2b59-4e93-90c5-5d025a4d8f6d', role: 'user' as const }
    );

    expect(calls.some(call => normalizeSql(call.sql).includes('update messaging.conversations set deleted_at = $2'))).toBe(true);
    expect(calls.some(call => normalizeSql(call.sql).includes('insert into messaging.conversation_audit'))).toBe(true);
  });
});

