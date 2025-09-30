import { describe, expect, test, vi } from 'vitest';

import { createPostgresMessagesReadAdapter } from '../../../../../ports/messages/postgres/messagesReadAdapter';
import type { SqlClient } from '../../../../../ports/shared/sql';
import type { MessageFilter } from '../../../../../ports/shared/types';

type QueryCall = { sql: string; params?: unknown[] };

const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim();

const makeMessageRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: '3e6396fa-3d0e-4e8c-b2f0-9d37c7b05c39',
  conversation_id: '2019b833-86a0-4a48-b9e6-a9f2384c598c',
  sender_id: 'a6f4f015-1bfa-489c-84c1-4f6243c50852',
  type: 'text',
  status: 'sent',
  encrypted_content: 'DATA',
  metadata: null,
  content_size: null,
  content_mime_type: null,
  created_at: '2025-09-29T12:00:00.000Z',
  updated_at: '2025-09-29T12:00:00.000Z',
  delivered_at: null,
  read_at: null,
  deleted_at: null,
  ...overrides
});

const createSqlMock = (nextRows: Array<{ rows: any[] }> = [{ rows: [makeMessageRow()] }]) => {
  const calls: QueryCall[] = [];
  const responses = [...nextRows];
  const query: SqlClient['query'] = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    return responses.shift() ?? { rows: [] };
  });
  return { sql: { query }, calls } as const;
};

const LIST_FILTER_CASES: Array<{ name: string; filter: MessageFilter; expectedParams: unknown[]; expectDeletedClause: boolean }>= [
  {
    name: 'no filters defaults to excluding deleted',
    filter: {},
    expectedParams: [],
    expectDeletedClause: true
  },
  {
    name: 'conversation only',
    filter: { conversationId: '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177' },
    expectedParams: ['1bbf7a30-4a7f-4fda-919c-2f5ef8d83177'],
    expectDeletedClause: true
  },
  {
    name: 'conversation + sender',
    filter: {
      conversationId: '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      senderId: 'b4d218ff-b6e2-4d10-9bd0-3b0ef09d978c'
    },
    expectedParams: [
      '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      'b4d218ff-b6e2-4d10-9bd0-3b0ef09d978c'
    ],
    expectDeletedClause: true
  },
  {
    name: 'conversation + sender + status + type',
    filter: {
      conversationId: '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      senderId: 'b4d218ff-b6e2-4d10-9bd0-3b0ef09d978c',
      status: 'read',
      type: 'file'
    },
    expectedParams: [
      '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      'b4d218ff-b6e2-4d10-9bd0-3b0ef09d978c',
      'read',
      'file'
    ],
    expectDeletedClause: true
  },
  {
    name: 'before timestamp',
    filter: {
      conversationId: '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      before: '2025-09-29T12:00:00.000Z'
    },
    expectedParams: ['1bbf7a30-4a7f-4fda-919c-2f5ef8d83177', '2025-09-29T12:00:00.000Z'],
    expectDeletedClause: true
  },
  {
    name: 'after timestamp',
    filter: {
      conversationId: '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      after: '2025-09-28T12:00:00.000Z'
    },
    expectedParams: ['1bbf7a30-4a7f-4fda-919c-2f5ef8d83177', '2025-09-28T12:00:00.000Z'],
    expectDeletedClause: true
  },
  {
    name: 'before and after',
    filter: {
      before: '2025-09-29T12:00:00.000Z',
      after: '2025-09-28T12:00:00.000Z'
    },
    expectedParams: ['2025-09-29T12:00:00.000Z', '2025-09-28T12:00:00.000Z'],
    expectDeletedClause: true
  },
  {
    name: 'include deleted explicitly true',
    filter: { includeDeleted: true },
    expectedParams: [],
    expectDeletedClause: false
  },
  {
    name: 'include deleted with conversation filter',
    filter: {
      conversationId: '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      includeDeleted: true
    },
    expectedParams: ['1bbf7a30-4a7f-4fda-919c-2f5ef8d83177'],
    expectDeletedClause: false
  },
  {
    name: 'full filter combination without deleted',
    filter: {
      conversationId: '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      senderId: 'b4d218ff-b6e2-4d10-9bd0-3b0ef09d978c',
      status: 'delivered',
      type: 'text',
      before: '2025-09-29T12:00:00.000Z',
      after: '2025-09-28T12:00:00.000Z'
    },
    expectedParams: [
      '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      'b4d218ff-b6e2-4d10-9bd0-3b0ef09d978c',
      'delivered',
      'text',
      '2025-09-29T12:00:00.000Z',
      '2025-09-28T12:00:00.000Z'
    ],
    expectDeletedClause: true
  },
  {
    name: 'full filter combination including deleted',
    filter: {
      conversationId: '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      senderId: 'b4d218ff-b6e2-4d10-9bd0-3b0ef09d978c',
      status: 'read',
      type: 'image',
      includeDeleted: true,
      before: '2025-09-29T12:00:00.000Z',
      after: '2025-09-28T12:00:00.000Z'
    },
    expectedParams: [
      '1bbf7a30-4a7f-4fda-919c-2f5ef8d83177',
      'b4d218ff-b6e2-4d10-9bd0-3b0ef09d978c',
      'read',
      'image',
      '2025-09-29T12:00:00.000Z',
      '2025-09-28T12:00:00.000Z'
    ],
    expectDeletedClause: false
  }
];

describe('PostgresMessagesReadAdapter.list()', () => {
  test.each(LIST_FILTER_CASES)(
    'applies filters: %s',
    async ({ filter, expectedParams, expectDeletedClause }) => {
      const { sql, calls } = createSqlMock();
      const adapter = createPostgresMessagesReadAdapter({ sql });

      await adapter.list(filter);

      expect(sql.query).toHaveBeenCalledTimes(1);
      const call = calls[0];
      expect(call.params).toEqual(expectedParams);
      const normalized = normalizeSql(call.sql);
      expect(normalized).toContain('order by created_at desc, id desc');
      if (expectDeletedClause) {
        expect(normalized).toContain('deleted_at is null');
      } else {
        expect(normalized).not.toContain('deleted_at is null');
      }
    }
  );
});

describe('PostgresMessagesReadAdapter.count()', () => {
  test.each(LIST_FILTER_CASES)(
    'matches list filters: %s',
    async ({ filter, expectedParams, expectDeletedClause }) => {
      const { sql, calls } = createSqlMock([{ rows: [{ count: '4' }] }]);
      const adapter = createPostgresMessagesReadAdapter({ sql });

      const result = await adapter.count(filter);

      expect(result).toBe(4);
      const call = calls[0];
      expect(call.params).toEqual(expectedParams);
      const normalized = normalizeSql(call.sql);
      expect(normalized).toContain('select count(*) from messaging.messages');
      if (expectDeletedClause) {
        expect(normalized).toContain('deleted_at is null');
      } else {
        expect(normalized).not.toContain('deleted_at is null');
      }
    }
  );
});

describe('PostgresMessagesReadAdapter.listPage()', () => {
  const PAGE_CASES: Array<{
    name: string;
    filter: MessageFilter;
    limit: number;
    cursor?: string;
    expectedParams: unknown[];
    expectDeletedClause: boolean;
  }> = [
    {
      name: 'basic pagination no cursor',
      filter: { conversationId: 'ee4aebd8-72d5-4974-92be-76e63df083ee' },
      limit: 25,
      expectedParams: ['ee4aebd8-72d5-4974-92be-76e63df083ee', 25],
      expectDeletedClause: true
    },
    {
      name: 'with cursor',
      filter: { conversationId: 'ee4aebd8-72d5-4974-92be-76e63df083ee', senderId: 'a3c5a7f2-794e-4b3c-b7d6-3c40f41449b0' },
      cursor: '84daa25a-227f-4a79-a779-d414b6e24ead',
      limit: 10,
      expectedParams: [
        'ee4aebd8-72d5-4974-92be-76e63df083ee',
        'a3c5a7f2-794e-4b3c-b7d6-3c40f41449b0',
        '84daa25a-227f-4a79-a779-d414b6e24ead',
        10
      ],
      expectDeletedClause: true
    },
    {
      name: 'with cursor include deleted',
      filter: { includeDeleted: true, before: '2025-09-29T12:00:00.000Z' },
      cursor: '84daa25a-227f-4a79-a779-d414b6e24ead',
      limit: 5,
      expectedParams: ['2025-09-29T12:00:00.000Z', '84daa25a-227f-4a79-a779-d414b6e24ead', 5],
      expectDeletedClause: false
    },
    {
      name: 'without filters include deleted false',
      filter: {},
      limit: 2,
      expectedParams: [2],
      expectDeletedClause: true
    }
  ];

  test.each(PAGE_CASES)(
    '%s',
    async ({ filter, limit, cursor, expectedParams, expectDeletedClause }) => {
      const { sql, calls } = createSqlMock();
      const adapter = createPostgresMessagesReadAdapter({ sql });

      const page = await adapter.listPage(filter, cursor, limit);

      expect(page.items).toHaveLength(1);
      const call = calls[0];
      expect(call.params).toEqual(expectedParams);
      const normalized = normalizeSql(call.sql);
      expect(normalized).toContain('order by created_at desc, id desc');
      expect(normalized).toContain('limit');
      if (expectDeletedClause) {
        expect(normalized).toContain('deleted_at is null');
      } else {
        expect(normalized).not.toContain('deleted_at is null');
      }
    }
  );
});

describe('PostgresMessagesReadAdapter.findById()', () => {
  test('returns mapped message when found', async () => {
    const row = makeMessageRow({
      id: '6d7b9d38-0890-41fd-8b32-ae31a5ce3b92',
      metadata: { replyTo: 'original' },
      content_size: 42,
      content_mime_type: 'text/plain',
      delivered_at: '2025-09-29T12:01:00.000Z',
      read_at: '2025-09-29T12:02:00.000Z',
      deleted_at: '2025-09-29T12:03:00.000Z'
    });
    const { sql } = createSqlMock([{ rows: [row] }]);
    const adapter = createPostgresMessagesReadAdapter({ sql });

    const message = await adapter.findById(row.id);

    expect(message).toMatchObject({
      id: row.id,
      metadata: { replyTo: 'original' },
      contentSize: 42,
      contentMimeType: 'text/plain',
      deliveredAt: '2025-09-29T12:01:00.000Z',
      readAt: '2025-09-29T12:02:00.000Z',
      deletedAt: '2025-09-29T12:03:00.000Z'
    });
  });

  test('returns null when not found', async () => {
    const { sql } = createSqlMock([{ rows: [] }]);
    const adapter = createPostgresMessagesReadAdapter({ sql });

    const message = await adapter.findById('2d5c85df-c4d1-47d8-a6f2-605b6cb42e06');

    expect(message).toBeNull();
  });
});

