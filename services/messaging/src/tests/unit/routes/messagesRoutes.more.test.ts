import { describe, it, expect } from 'vitest';
import { createTestMessagingServer, TEST_CONVERSATION_ID, TEST_USER_ID, TEST_MESSAGE_ID } from './setupTestServer';

const conv = TEST_CONVERSATION_ID;
const sender = TEST_USER_ID;

const withAuth = (headers: Record<string, string> = {}) => ({
  authorization: 'Bearer token',
  ...headers,
});

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('message routes (more edge cases)', () => {
  it('rejects invalid base64 payload (validation error)', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        headers: withAuth(),
        payload: {
          conversationId: conv,
          senderId: sender,
          type: 'text',
          encryptedContent: 'not-base64!!',
          payloadSizeBytes: 10,
        },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      const body = res.json();
      if (Array.isArray(body)) {
        expect(body[0]?.path).toEqual(['body', 'encryptedContent']);
      } else {
        expect(typeof body.message === 'string').toBe(true);
      }
    } finally {
      await app.close();
    }
  });

  it('rejects size mismatch', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        headers: withAuth(),
        payload: {
          conversationId: conv,
          senderId: sender,
          type: 'text',
          encryptedContent: Buffer.from('hello').toString('base64'),
          payloadSizeBytes: 4,
        },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('returns 404 for missing message by id', async () => {
    const app = await createTestMessagingServer();
    try {
      app.messagesReadPort.findById.mockResolvedValueOnce(null);
      const res = await app.inject({ method: 'GET', url: '/v1/messages/11111111-1111-1111-1111-111111111111', headers: withAuth() });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('PAYLOAD_INVALID');
    } finally {
      await app.close();
    }
  });

  it('returns conversationId for message conversation lookup', async () => {
    const app = await createTestMessagingServer();
    try {
      app.messagesReadPort.findById.mockResolvedValueOnce({
        id: TEST_MESSAGE_ID,
        conversationId: conv,
        senderId: sender,
        type: 'text',
        status: 'sent',
        encryptedContent: b64('x'),
        contentSize: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const res = await app.inject({ method: 'GET', url: '/v1/messages/11111111-1111-1111-1111-111111111111/conversation', headers: withAuth() });
      expect(res.statusCode).toBe(200);
      expect(res.json().conversationId).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('mark read returns updated count', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/messages/read',
        headers: withAuth(),
        payload: {
          messageIds: [TEST_MESSAGE_ID],
          readAt: new Date().toISOString(),
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(1);
    } finally {
      await app.close();
    }
  });
});
