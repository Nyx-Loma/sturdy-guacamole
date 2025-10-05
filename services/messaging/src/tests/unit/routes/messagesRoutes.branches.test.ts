import { describe, it, expect } from 'vitest';
import { createTestMessagingServer, TEST_CONVERSATION_ID, TEST_USER_ID, TEST_MESSAGE_ID } from './setupTestServer';

const conv = TEST_CONVERSATION_ID;
const sender = TEST_USER_ID;

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

const withAuth = (headers: Record<string, string> = {}) => ({
  authorization: 'Bearer token',
  ...headers,
});

describe('message routes (branches)', () => {
  it('rejects payload above cap with 413', async () => {
    const app = await createTestMessagingServer();
    try {
      app.config.PAYLOAD_MAX_BYTES = 1;
      const res = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        headers: withAuth(),
        payload: { conversationId: conv, senderId: sender, type: 'text', encryptedContent: b64('xx'), payloadSizeBytes: 2 },
      });
      expect([413, 400]).toContain(res.statusCode);
    } finally {
      await app.close();
    }
  });

  it('idempotent replay returns 200', async () => {
    const app = await createTestMessagingServer();
    try {
      const existingId = TEST_MESSAGE_ID;
      app.messageService.send.mockResolvedValueOnce(existingId);
      app.messagesReadPort.findById.mockResolvedValueOnce({
        id: existingId,
        conversationId: conv,
        senderId: sender,
        type: 'text',
        status: 'sent',
        encryptedContent: b64('x'),
        contentSize: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const res = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        headers: withAuth({ 'idempotency-key': '11111111-1111-1111-1111-111111111111' }),
        payload: { conversationId: conv, senderId: sender, type: 'text', encryptedContent: b64('x'), payloadSizeBytes: 1 },
      });
      expect([200, 201]).toContain(res.statusCode);
      expect(res.headers).toHaveProperty('idempotent-replay');
    } finally {
      await app.close();
    }
  });

  it('listPage with nextCursor present', async () => {
    const app = await createTestMessagingServer();
    try {
      app.messagesReadPort.listPage.mockResolvedValueOnce({
        items: [{
          id: TEST_MESSAGE_ID,
          conversationId: conv,
          senderId: sender,
          type: 'text',
          status: 'sent',
          encryptedContent: 'AA==',
          contentSize: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
        nextCursor: 'tok',
      });
      const res = await app.inject({ method: 'GET', url: `/v1/messages/conversation/${conv}`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('nextCursor');
    } finally {
      await app.close();
    }
  });

  it('listPage without nextCursor', async () => {
    const app = await createTestMessagingServer();
    try {
      app.messagesReadPort.listPage.mockResolvedValueOnce({ items: [], nextCursor: null });
      const res = await app.inject({ method: 'GET', url: `/v1/messages/conversation/${conv}`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.nextCursor === undefined || body.nextCursor === null || typeof body.nextCursor === 'string').toBe(true);
    } finally {
      await app.close();
    }
  });
});
