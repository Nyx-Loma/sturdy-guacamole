import { describe, it, expect } from 'vitest';
import { createTestMessagingServer } from './setupTestServer';

const conversationId = '11111111-1111-1111-1111-111111111111';
const creatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const authHeaders = {
  authorization: 'Bearer token',
};

const withAuth = (headers: Record<string, string> = {}) => ({
  ...authHeaders,
  ...headers,
});

describe('conversations routes (more branches)', () => {
  it('rejects direct conversation with wrong participant count', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/conversations',
        headers: withAuth(),
        payload: { type: 'direct', participants: [creatorId, creatorId, creatorId] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('INVALID_DIRECT_CONVERSATION');
    } finally {
      await app.close();
    }
  });

  it('creates group conversation without idempotency key', async () => {
    const app = await createTestMessagingServer();
    try {
      app.conversationsWritePort.create.mockResolvedValueOnce(conversationId);
      app.conversationsReadPort.findById.mockResolvedValueOnce({
        id: conversationId,
        type: 'group',
        name: null,
        description: null,
        avatarUrl: null,
        participants: [
          { userId: creatorId, role: 'owner', joinedAt: new Date().toISOString() },
        ],
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

      const res = await app.inject({
        method: 'POST',
        url: '/v1/conversations',
        headers: withAuth(),
        payload: { type: 'group', participants: [creatorId] },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().conversation.type).toBe('group');
    } finally {
      await app.close();
    }
  });

  it('updates conversation with If-Match handles version conflict', async () => {
    const app = await createTestMessagingServer();
    try {
      const versionConflict = new Error('conflict');
      (versionConflict as Error & { code: string }).code = 'VERSION_CONFLICT';
      app.conversationsWritePort.updateMetadata.mockRejectedValueOnce(versionConflict);

      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/conversations/${conversationId}`,
        headers: withAuth({ 'if-match': '2' }),
        payload: { metadata: { name: 'New' } },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('VERSION_CONFLICT');
      expect(app.messagingMetrics.conversationVersionConflicts.inc).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('lists conversations with invalid cursor returns 400', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/conversations?cursor=not-base64',
        headers: withAuth(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('INVALID_CURSOR');
    } finally {
      await app.close();
    }
  });

  it('participant conversation service list handles pagination', async () => {
    const app = await createTestMessagingServer();
    try {
      app.conversationService.listParticipants.mockResolvedValueOnce({
        items: [
          {
            userId: 'p1',
            role: 'member',
            joinedAt: new Date().toISOString(),
            leftAt: null,
          },
        ],
        nextCursor: 'cursor-token',
      });

      const res = await app.inject({
        method: 'GET',
        url: `/v1/conversations/${conversationId}/participants`,
        headers: withAuth(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.participants).toHaveLength(1);
      expect(body.nextCursor).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  it('lists conversations with limit applied', async () => {
    const app = await createTestMessagingServer();
    try {
      app.conversationsReadPort.listPage.mockResolvedValueOnce({ items: [], nextCursor: undefined });
      const res = await app.inject({ method: 'GET', url: '/v1/conversations?limit=1', headers: withAuth() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.conversations)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
