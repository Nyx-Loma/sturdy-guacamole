import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createPostgresMessagesWriteAdapter } from '../../../../../ports/messages/postgres/messagesWriteAdapter';

type QueryCall = { sql: string; params?: unknown[] };

const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

type SqlHandler = (params?: unknown[]) => Promise<{ rows?: unknown[] }> | { rows?: unknown[] } | void;

const createSqlMock = (overrides: Record<string, SqlHandler> = {}) => {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const key = normalizeSql(sql);
    const handler = overrides[key];
    if (handler) {
      const result = await handler(params);
      return result ?? { rows: [] };
    }
    return { rows: [] };
  });

  return { sql: { query }, calls } as const;
};

const toCallSummary = (call: QueryCall) => ({ sql: normalizeSql(call.sql), params: call.params });

const now = () => new Date('2025-09-29T12:00:00.000Z');

const baseCommand = {
  input: {
    conversationId: 'df7f5d9e-734b-4f5e-9a8f-4b8d74a1e7c5',
    senderId: 'c2d5d8a9-6a8b-4de5-9121-7080b8f20558',
    type: 'text' as const,
    encryptedContent: 'ZW5jcnlwdGVk',
    metadata: { replyTo: null } as Record<string, unknown>
  }
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PostgresMessagesWriteAdapter.create()', () => {
  const idempotentCases = [
    { name: 'without idempotency key', command: baseCommand },
    { name: 'with new idempotency key', command: { ...baseCommand, idempotencyKey: 'client-key-1' } },
    { name: 'with metadata omitted', command: { input: { ...baseCommand.input, metadata: undefined } } },
    { name: 'with binary metadata flag', command: { input: { ...baseCommand.input, metadata: { attachment: true } } } },
    { name: 'with custom type', command: { input: { ...baseCommand.input, type: 'image' as const } } },
    { name: 'with content size', command: { input: { ...baseCommand.input, contentSize: 2048 } } },
    { name: 'with mime type', command: { input: { ...baseCommand.input, contentMimeType: 'image/png' } } },
    { name: 'with both size and mime', command: { input: { ...baseCommand.input, contentSize: 512, contentMimeType: 'text/markdown' } } },
    { name: 'with null metadata via command', command: { input: { ...baseCommand.input, metadata: null as unknown as Record<string, unknown> } } },
    { name: 'with idempotency and metadata', command: { ...baseCommand, idempotencyKey: 'client-key-22', input: { ...baseCommand.input, metadata: { replyTo: 'prev' } } } }
  ];

  test.each(idempotentCases)('%s', async ({ command }) => {
    const handlers: Record<string, SqlHandler> = {
      [normalizeSql('select message_id from messaging.message_idempotency where sender_id = $1 and key = $2 limit 1')]: () => ({ rows: [] }),
      [normalizeSql('insert into messaging.messages ( id, conversation_id, sender_id, type, status, encrypted_content, metadata, content_size, content_mime_type, created_at, updated_at ) values ( $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11 )')]: () => ({ rows: [] }),
      [normalizeSql('insert into messaging.message_idempotency (sender_id, key, message_id, created_at) values ($1,$2,$3,$4) on conflict (sender_id, key) do update set message_id = excluded.message_id')]: () => ({ rows: [] })
    };

    const { sql, calls } = createSqlMock(handlers);
    const adapter = createPostgresMessagesWriteAdapter({ sql, now });

    const generatedId = await adapter.create(command as any);

    expect(typeof generatedId).toBe('string');
    expect(sql.query).toHaveBeenCalled();
    const texts = calls.map(toCallSummary);
    expect(texts[0].sql).toBe('begin');
    if ('idempotencyKey' in command) {
      const selectCall = texts.find(call => call.sql.includes('select message_id'));
      expect(selectCall?.params).toEqual([command.input.senderId, command.idempotencyKey]);
    }

    const insertCall = texts.find(call => call.sql.includes('insert into messaging.messages'));
    expect(insertCall?.params?.at(1)).toBe(command.input.conversationId);
    expect(insertCall?.params?.at(2)).toBe(command.input.senderId);
    expect(insertCall?.params?.at(3)).toBe(command.input.type);
    expect(insertCall?.params?.at(4)).toBe('sent');
    if ('idempotencyKey' in command) {
      const idempotentCall = texts.find(call => call.sql.includes('insert into messaging.message_idempotency'));
      expect(idempotentCall?.params?.at(0)).toBe(command.input.senderId);
      expect(idempotentCall?.params?.at(1)).toBe(command.idempotencyKey);
    }
    expect(texts.at(-1)?.sql).toBe('commit');
  });

  test('returns idempotent id when matching key exists', async () => {
    const knownId = 'cbb66de3-dfb6-40c2-9528-7ed52491d3d7';
    const handlers: Record<string, SqlHandler> = {
      [normalizeSql('select message_id from messaging.message_idempotency where sender_id = $1 and key = $2 limit 1')]: () => ({ rows: [{ message_id: knownId }] })
    };
    const { sql, calls } = createSqlMock(handlers);
    const adapter = createPostgresMessagesWriteAdapter({ sql, now });

    const returnedId = await adapter.create({ ...baseCommand, idempotencyKey: 'existing-key' });

    expect(returnedId).toBe(knownId);
    const texts = calls.map(toCallSummary);
    expect(texts.some(call => call.sql.includes('insert into messaging.messages'))).toBe(false);
    expect(texts.at(-1)?.sql).toBe('commit');
  });
});

describe('PostgresMessagesWriteAdapter.updateStatus()', () => {
  const STATUS_CASES = [
    { status: 'sent', timestamp: '2025-09-29T12:01:00.000Z' },
    { status: 'delivered', timestamp: '2025-09-29T12:01:00.000Z' },
    { status: 'read', timestamp: '2025-09-29T12:02:00.000Z' },
    { status: 'failed', timestamp: '2025-09-29T12:03:00.000Z' }
  ] as const;

  test.each(STATUS_CASES)('applies transition %#', async ({ status, timestamp }) => {
    const { sql, calls } = createSqlMock();
    const adapter = createPostgresMessagesWriteAdapter({ sql, now });

    await adapter.updateStatus('d5f3df5e-4568-4bd8-9d62-be8f4076f0b7', status, timestamp);

    expect(sql.query).toHaveBeenCalledTimes(1);
    const [call] = calls.map(toCallSummary);
    expect(call.sql).toContain('update messaging.messages');
    expect(call.params?.at(0)).toBe('d5f3df5e-4568-4bd8-9d62-be8f4076f0b7');
    expect(call.params?.at(1)).toBe(status);
    expect(call.params?.at(3)).toBe(timestamp);
  });
});

describe('PostgresMessagesWriteAdapter.markAsRead()', () => {
  const CASES = [
    { name: 'no ids', ids: [] as string[] },
    { name: 'single id', ids: ['e76d18a4-9ddf-4361-96ce-201bccf1ebbb'] },
    { name: 'multiple ids', ids: [
      'e76d18a4-9ddf-4361-96ce-201bccf1ebbb',
      '3b9f2993-d525-4f19-b6e1-17b9d73a38d8'
    ] }
  ];

  test.each(CASES)('$name', async ({ ids }) => {
    const { sql, calls } = createSqlMock();
    const adapter = createPostgresMessagesWriteAdapter({ sql, now });

    await adapter.markAsRead(ids, '2025-09-29T12:10:00.000Z');

    if (ids.length === 0) {
      expect(sql.query).not.toHaveBeenCalled();
      return;
    }
    const [call] = calls.map(toCallSummary);
    expect(call.sql).toContain('update messaging.messages');
    expect(call.params?.at(0)).toEqual(ids);
    expect(call.params?.at(1)).toBe('2025-09-29T12:10:00.000Z');
  });
});

describe('PostgresMessagesWriteAdapter.softDelete()', () => {
  const CASES = [
    '2025-09-29T12:20:00.000Z',
    '2025-09-29T12:21:00.000Z',
    '2025-09-29T12:22:00.000Z',
    '2025-09-29T12:23:00.000Z',
    '2025-09-29T12:24:00.000Z'
  ];

  test.each(CASES)('soft deletes with timestamp %s', async (timestamp) => {
    const { sql, calls } = createSqlMock();
    const adapter = createPostgresMessagesWriteAdapter({ sql, now });

    await adapter.softDelete('9d6d8f35-4378-4c49-8cc4-79db334d90f1', timestamp);

    const [call] = calls.map(toCallSummary);
    expect(call.sql).toContain('update messaging.messages');
    expect(call.params?.at(0)).toBe('9d6d8f35-4378-4c49-8cc4-79db334d90f1');
    expect(call.params?.at(1)).toBe(timestamp);
  });
});

