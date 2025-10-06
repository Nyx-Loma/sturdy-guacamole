import { describe, it, expect } from 'vitest';
import { createTestMessagingServer } from './setupTestServer';

const conversationId = '11111111-1111-1111-1111-111111111111';

const withAuth = () => ({ authorization: 'Bearer token' });

describe('routes pagination & cursor (more)', () => {
  it('conversations list returns empty with null nextCursor', async () => {
    const app = await createTestMessagingServer();
    try {
      app.conversationsReadPort.listPage.mockResolvedValueOnce({ items: [], nextCursor: undefined });
      const res = await app.inject({ method: 'GET', url: '/v1/conversations', headers: withAuth() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.conversations)).toBe(true);
      expect(body.nextCursor).toBeNull();
    } finally {
      await app.close();
    }
  });

  it.skip('participants list accepts encoded cursor and returns 200', async () => {
    const app = await createTestMessagingServer();
    try {
      const cursor = Buffer.from(JSON.stringify({ ts: new Date().toISOString(), id: 'user-1' })).toString('base64url');
      const res = await app.inject({
        method: 'GET',
        url: `/v1/conversations/${conversationId}/participants?cursor=${cursor}`,
        headers: withAuth(),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('messages list accepts encoded cursor for conversation', async () => {
    const app = await createTestMessagingServer();
    try {
      app.messagesReadPort.listPage.mockResolvedValueOnce({ items: [], nextCursor: undefined });
      const cursor = Buffer.from(JSON.stringify({ before: new Date().toISOString(), token: 'tok' })).toString('base64url');
      const res = await app.inject({
        method: 'GET',
        url: `/v1/messages/conversation/${conversationId}?cursor=${cursor}`,
        headers: withAuth(),
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});


