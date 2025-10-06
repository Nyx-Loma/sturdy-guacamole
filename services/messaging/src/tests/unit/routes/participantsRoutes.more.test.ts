import { describe, it, expect } from 'vitest';
import { createTestMessagingServer } from './setupTestServer';

const conversationId = '11111111-1111-1111-1111-111111111111';
const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const withAuth = () => ({ authorization: 'Bearer token' });

describe('participant routes - edge cases', () => {
  it('validates add participant body', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/conversations/${conversationId}/participants`,
        headers: withAuth(),
        payload: { role: 'member' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });

  it('adds participant happy path', async () => {
    const app = await createTestMessagingServer();
    try {
      const participantSnapshot = {
        userId: userB,
        role: 'member',
        joinedAt: '2025-09-01T00:00:00.000Z',
        leftAt: undefined,
      };
      app.conversationService.addParticipants.mockResolvedValueOnce(undefined);
      app.conversationService.listParticipants.mockResolvedValueOnce({
        items: [participantSnapshot],
        nextCursor: undefined,
      });
      const res = await app.inject({
        method: 'POST',
        url: `/v1/conversations/${conversationId}/participants`,
        headers: withAuth(),
        payload: { userId: userB, role: 'member' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().participant).toEqual({
        userId: participantSnapshot.userId,
        role: 'member',
        joinedAt: participantSnapshot.joinedAt,
        leftAt: null,
      });
      expect(app.messagingMetrics.participantsAddedTotal.inc).toHaveBeenCalled();
      expect(app.conversationService.addParticipants).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('validates remove participant params', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({ method: 'DELETE', url: `/v1/conversations/not-a-uuid/participants/${userA}`, headers: withAuth() });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });

  it('removes participant happy path', async () => {
    const app = await createTestMessagingServer();
    try {
      const now = new Date().toISOString();
      app.conversationsReadPort.findById.mockResolvedValueOnce({
        id: conversationId,
        participants: [
          {
            userId: userA,
            role: 'member',
            joinedAt: now,
            leftAt: null,
          },
        ],
      });
      app.conversationService.removeParticipant.mockResolvedValueOnce(undefined);
      const res = await app.inject({ method: 'DELETE', url: `/v1/conversations/${conversationId}/participants/${userA}`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
      expect(res.json().removed).toBe(true);
      expect(app.messagingMetrics.participantsRemovedTotal.inc).toHaveBeenCalledWith({ role: 'member' });
      expect(app.conversationService.removeParticipant).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('validates list participants params', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({ method: 'GET', url: `/v1/conversations/not-a-uuid/participants`, headers: withAuth() });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });

  it('lists participants with defaults', async () => {
    const app = await createTestMessagingServer();
    try {
      app.conversationService.listParticipants.mockResolvedValueOnce({
        items: [
          {
            userId: userA,
            role: 'member',
            joinedAt: new Date().toISOString(),
            leftAt: undefined,
          },
        ],
        nextCursor: undefined,
      });
      const res = await app.inject({ method: 'GET', url: `/v1/conversations/${conversationId}/participants`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.participants)).toBe(true);
      expect(body.nextCursor === null).toBe(true);
      expect(app.conversationService.listParticipants).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('invalid cursor returns 400', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({ method: 'GET', url: `/v1/conversations/${conversationId}/participants?cursor=not-base64`, headers: withAuth() });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('INVALID_CURSOR');
    } finally {
      await app.close();
    }
  });

  it('coerces includeLeft false by default', async () => {
    const app = await createTestMessagingServer();
    try {
      const res = await app.inject({ method: 'GET', url: `/v1/conversations/${conversationId}/participants`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('supports explicit includeLeft=true', async () => {
    const app = await createTestMessagingServer();
    try {
      app.conversationService.listParticipants.mockResolvedValueOnce({
        items: [
          {
            userId: userA,
            role: 'member',
            joinedAt: new Date().toISOString(),
            leftAt: undefined,
          },
          {
            userId: userB,
            role: 'member',
            joinedAt: new Date().toISOString(),
            leftAt: new Date().toISOString(),
          },
        ],
        nextCursor: undefined,
      });
      const res = await app.inject({ method: 'GET', url: `/v1/conversations/${conversationId}/participants?includeLeft=true`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.participants.some((participant: { userId: string }) => participant.userId === userB)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('supports limit override', async () => {
    const app = await createTestMessagingServer();
    try {
      app.conversationService.listParticipants.mockResolvedValueOnce({
        items: Array.from({ length: 10 }, (_, index) => ({
          userId: `user-${index}`,
          role: 'member',
          joinedAt: new Date(Date.now() + index * 1000).toISOString(),
          leftAt: undefined,
        })),
        nextCursor: 'cursor-token',
      });
      const res = await app.inject({ method: 'GET', url: `/v1/conversations/${conversationId}/participants?limit=10`, headers: withAuth() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.participants).toHaveLength(10);
      expect(typeof body.nextCursor === 'string' || body.nextCursor === null).toBe(true);
      expect(app.conversationService.listParticipants).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});


