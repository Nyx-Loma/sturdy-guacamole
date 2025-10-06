import { describe, expect, it } from 'vitest';
import { createTestMessagingServer, TEST_MESSAGE_ID } from './setupTestServer';

const withAuth = (headers: Record<string, string> = {}) => ({ authorization: 'Bearer token', ...headers });

describe('message routes', () => {
  it('accepts a message send request', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        headers: withAuth(),
        payload: {
          conversationId: '00000000-0000-0000-0000-000000000000',
          senderId: '00000000-0000-0000-0000-000000000001',
          type: 'text',
          encryptedContent: 'SGVsbG8=',
          payloadSizeBytes: 5,
        },
      });

      if (response.statusCode >= 400) {
        console.error('POST /v1/messages error', response.payload);
        console.error('Mock message', app.messagesReadPort.findById.mock.results);
      }

      expect([200, 201]).toContain(response.statusCode);
    } finally {
      await app.close();
    }
  });

  it('validates message payload', async () => {
    const app = await createTestMessagingServer({ injectAuth: false });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        payload: {
          conversationId: 'invalid',
          senderId: '00000000-0000-0000-0000-000000000001',
          type: 'text',
          encryptedContent: 'SGVsbG8=',
          payloadSizeBytes: 5,
        },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('returns a message by id', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/messages/11111111-1111-1111-1111-111111111111',
        headers: withAuth(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe(TEST_MESSAGE_ID);
    } finally {
      await app.close();
    }
  });

  it('lists messages for a conversation', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/messages/conversation/00000000-0000-0000-0000-000000000000',
        headers: withAuth(),
      });

      if (response.statusCode >= 400) {
        console.error('GET /v1/messages/conversation error', response.payload);
        console.error('Mock listPage', app.messagesReadPort.listPage.mock.results);
      }

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.items)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('marks messages as read', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/messages/read',
        headers: withAuth(),
        payload: {
          messageIds: ['11111111-1111-1111-1111-111111111111'],
          actorId: '00000000-0000-0000-0000-000000000001',
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().updated).toBe(1);
    } finally {
      await app.close();
    }
  });
});


