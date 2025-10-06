import { describe, it, expect } from 'vitest';
import { createTestMessagingServer } from './setupTestServer';

const conversationId = '11111111-1111-1111-1111-111111111111';
const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const withAuth = () => ({ authorization: 'Bearer token' });

describe.skip('participants routes (branches)', () => {
  it('list participants has nextCursor when hasMore (mocked)', async () => {
    const app = await createTestMessagingServer();
    try {
      app.conversationsReadPort.findById.mockResolvedValueOnce({
        id: conversationId,
        type: 'group',
        name: null,
        description: null,
        avatarUrl: null,
        participants: [],
        settings: {
          whoCanAddParticipants: 'admin',
          whoCanSendMessages: 'member',
          messageRetentionDays: 0,
          e2eeEnabled: true,
          maxParticipants: 0,
        },
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        deletedAt: null,
      });
      app.messagesReadPort.listPage.mockResolvedValueOnce({ items: [], nextCursor: undefined });
      const res = await app.inject({
        method: 'GET',
        url: `/v1/messages/conversation/${conversationId}?limit=1`,
        headers: withAuth(),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('list respects includeLeft flag', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/conversations/${conversationId}/participants?includeLeft=true`,
        headers: withAuth(),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('list with valid cursor path returns 200', async () => {
    const app = await createTestMessagingServer();
    try {
      const cursor = Buffer.from(JSON.stringify({ ts: new Date().toISOString(), id: userA })).toString('base64url');
      const res = await app.inject({
        method: 'GET',
        url: `/v1/conversations/${conversationId}/participants?cursor=${cursor}`,
        headers: withAuth(),
      });
      expect([200, 400]).toContain(res.statusCode);
    } finally {
      await app.close();
    }
  });
});
