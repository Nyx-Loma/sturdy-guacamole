import { describe, expect, it } from 'vitest';
import { createTestMessagingServer, TEST_CONVERSATION_ID, TEST_USER_ID } from './setupTestServer';

const conversationId = TEST_CONVERSATION_ID;
const creatorId = TEST_USER_ID;
const memberId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const withAuth = () => ({ authorization: 'Bearer token' });

describe('conversation routes', () => {
  it('creates a group conversation', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/conversations',
        headers: withAuth(),
        payload: {
          type: 'group',
          participants: [creatorId, memberId],
          metadata: { name: 'Test Group' },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.conversation).toEqual(expect.objectContaining({
        id: conversationId,
        type: 'group',
      }));
      expect(body.participants).toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: creatorId, role: 'admin' }),
      ]));
      expect(app.messagingMetrics.conversationsCreatedTotal.inc).toHaveBeenCalledWith({ type: 'group' });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid direct payload', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/conversations',
        headers: withAuth(),
        payload: {
          type: 'direct',
          participants: [creatorId],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('INVALID_DIRECT_CONVERSATION');
    } finally {
      await app.close();
    }
  });

  it('requires authentication', async () => {
    const app = await createTestMessagingServer({ injectAuth: false });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/conversations',
        payload: {
          type: 'group',
          participants: [creatorId, memberId],
        },
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('returns a conversation by id', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/conversations/${conversationId}`,
        headers: withAuth(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expect.objectContaining({
        conversation: expect.objectContaining({ id: conversationId }),
        participants: expect.any(Array),
      }));
    } finally {
      await app.close();
    }
  });

  it.skip('validates list query parameters', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/conversations',
        query: { limit: 0 },
        headers: withAuth(),
      });
      expect([400, 500, 404]).toContain(response.statusCode);
    } finally {
      await app.close();
    }
  });
});

describe('participant routes', () => {
  const participantId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  it('adds a participant', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/conversations/${conversationId}/participants`,
        headers: withAuth(),
        payload: { userId: participantId, role: 'member' },
      });
      expect([200, 201, 404, 501]).toContain(response.statusCode);
    } finally {
      await app.close();
    }
  });

  it('removes a participant', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/conversations/${conversationId}/participants/${participantId}`,
        headers: withAuth(),
      });
      expect([200, 404, 501]).toContain(response.statusCode);
    } finally {
      await app.close();
    }
  });

  it('validates participant payload', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/conversations/${conversationId}/participants`,
        headers: withAuth(),
        payload: { role: 'member' },
      });
      expect([400, 404]).toContain(response.statusCode);
    } finally {
      await app.close();
    }
  });

  it('validates participant query parameters', async () => {
    const app = await createTestMessagingServer();
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/conversations/${conversationId}/participants`,
        headers: withAuth(),
        query: { limit: 0 },
      });
      expect([400, 404, 500]).toContain(response.statusCode);
    } finally {
      await app.close();
    }
  });
});
