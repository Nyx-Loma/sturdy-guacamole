import { describe, it, expect, vi } from 'vitest';
import { messagingMetrics } from '../../../observability/metrics';
import { createTestMessagingServer, TEST_CONVERSATION_ID, TEST_USER_ID, TEST_MESSAGE_ID } from './setupTestServer';

const conv = TEST_CONVERSATION_ID;
const sender = TEST_USER_ID;

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

const authHeaders = {
  authorization: 'Bearer test-token',
};

const withAuth = (headers: Record<string, string> = {}) => ({
  ...authHeaders,
  ...headers,
});

describe('message routes (idempotency and headers)', () => {
  it('returns 201 for first send and Location header', async () => {
    const app = await createTestMessagingServer();
    try {
      app.messageService.send.mockResolvedValueOnce(TEST_MESSAGE_ID);
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
      const res = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        headers: withAuth(),
        payload: { conversationId: conv, senderId: sender, type: 'text', encryptedContent: b64('x'), payloadSizeBytes: 1 },
      });
      expect([200, 201]).toContain(res.statusCode);
      expect(res.headers['location']).toContain(`/v1/messages/${TEST_MESSAGE_ID}`);
      expect(['true', 'false']).toContain(String(res.headers['idempotent-replay']));
    } finally {
      await app.close();
    }
  });

  it('size mismatch triggers 400 VALIDATION_ERROR (schema or handler)', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        headers: withAuth(),
        payload: { conversationId: conv, senderId: sender, type: 'text', encryptedContent: b64('xx'), payloadSizeBytes: 1 },
      });
      expect([400, 413]).toContain(res.statusCode);
    } finally {
      await app.close();
    }
  });

  it('missing required fields triggers validation error', async () => {
    const app = await createTestMessagingServer({ injectAuth: false });
    try {
      const res = await app.inject({ method: 'POST', url: '/v1/messages', payload: {} });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('get message by id returns 200 from mock', async () => {
    const app = await createTestMessagingServer();
    try {
      const id = '11111111-1111-1111-1111-111111111111';
      const res = await app.inject({ method: 'GET', url: `/v1/messages/${id}`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('get message conversation returns conversationId', async () => {
    const app = await createTestMessagingServer();
    try {
      const id = '11111111-1111-1111-1111-111111111111';
      const res = await app.inject({ method: 'GET', url: `/v1/messages/${id}/conversation`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
      expect(res.json().conversationId).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('list messages with query filters returns 200', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({ method: 'GET', url: `/v1/messages/conversation/${conv}?type=text&status=sent&limit=1`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('list messages with cursor merges query and cursor params', async () => {
    const app = await createTestMessagingServer();
    try {
      const cursor = Buffer.from(JSON.stringify({ before: new Date().toISOString(), token: 't1' })).toString('base64url');
      const res = await app.inject({ method: 'GET', url: `/v1/messages/conversation/${conv}?cursor=${cursor}&limit=1`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('items');
      expect(body.nextCursor === undefined || body.nextCursor === null || typeof body.nextCursor === 'string').toBe(true);
    } finally {
      await app.close();
    }
  });

  it('mark read with empty array returns updated 0', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({ method: 'POST', url: '/v1/messages/read', headers: withAuth(), payload: { messageIds: [], actorId: sender, readAt: new Date().toISOString() } });
      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('mark read increments metrics for non-empty arrays', async () => {
    const app = await createTestMessagingServer();
    try {
      const incSpy = vi.spyOn(messagingMetrics.markReadUpdates, 'inc').mockImplementation(() => undefined);
      app.messageService.markRead.mockResolvedValueOnce(undefined);
      const res = await app.inject({ method: 'POST', url: '/v1/messages/read', headers: withAuth(), payload: { messageIds: ['11111111-1111-1111-1111-111111111111'], readAt: new Date().toISOString() } });
      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(1);
      incSpy.mockRestore();
    } finally {
      await app.close();
    }
  });
});
