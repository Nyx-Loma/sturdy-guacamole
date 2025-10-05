import Fastify from 'fastify';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequireParticipant, createRequireAdmin, createRequireParticipantOrSelf } from '../../../../app/middleware/requireParticipant';

const makeApp = () => Fastify({ logger: false });

const fakeAuth = {
  userId: 'user-1',
  deviceId: 'device-1',
  sessionId: 'session-1',
  scope: [],
  issuedAt: Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
};

describe('requireParticipant middleware', () => {
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    app = makeApp();
    app.addHook('preHandler', (request, _reply, done) => {
      (request as { auth?: typeof fakeAuth }).auth = fakeAuth;
      done();
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('bypasses public route /health', async () => {
    const cache = { get: vi.fn().mockResolvedValue([]) };
    const requireParticipant = createRequireParticipant(cache as any);
    app.get('/health', { preHandler: requireParticipant }, async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 403 when not a participant', async () => {
    const cache = { get: vi.fn().mockResolvedValue([]) };
    const requireParticipant = createRequireParticipant(cache as any);
    app.post('/secure', { preHandler: requireParticipant }, async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/secure', payload: { conversationId: 'conv-1' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('NOT_A_PARTICIPANT');
  });

  it('allows when participant present in cache', async () => {
    const cache = { get: vi.fn().mockResolvedValue(['user-1']) };
    const requireParticipant = createRequireParticipant(cache as any);
    app.post('/secure', { preHandler: requireParticipant }, async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/secure', payload: { conversationId: 'conv-1' } });
    expect(res.statusCode).toBe(200);
  });

  it('fails closed on cache error (denies request)', async () => {
    const cache = { get: vi.fn().mockRejectedValue(new Error('redis down')) };
    const requireParticipant = createRequireParticipant(cache as any);
    app.post('/secure', { preHandler: requireParticipant }, async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/secure', payload: { conversationId: 'conv-1' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('NOT_A_PARTICIPANT');
  });

  it('skips auth when conversationId not present', async () => {
    const cache = { get: vi.fn().mockResolvedValue([]) };
    const requireParticipant = createRequireParticipant(cache as any);
    app.post('/no-conv', { preHandler: requireParticipant }, async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/no-conv', payload: { somethingElse: true } });
    expect(res.statusCode).toBe(200);
  });

  it('createRequireAdmin allows participant', async () => {
    const cache = { 
      get: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockResolvedValue(undefined)
    };
    const participantsReadPort = {
      list: vi.fn().mockResolvedValue([{ userId: 'user-1', role: 'admin', leftAt: null }])
    };
    const requireAdmin = createRequireAdmin(cache as any, participantsReadPort);
    app.post('/admin', { preHandler: requireAdmin }, async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/admin', payload: { conversationId: 'conv-1' } });
    expect(res.statusCode).toBe(200);
  });

  it('createRequireParticipantOrSelf allows self removal', async () => {
    const cache = { get: vi.fn().mockResolvedValue([]) };
    const requireSelf = createRequireParticipantOrSelf(cache as any);
    app.delete('/v1/conversations/:conversationId/participants/:userId', { preHandler: requireSelf }, async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: '/v1/conversations/c1/participants/user-1' });
    expect(res.statusCode).toBe(200);
  });

  it('createRequireParticipantOrSelf denies non-self non-participant', async () => {
    const cache = { get: vi.fn().mockResolvedValue([]) };
    const requireSelf = createRequireParticipantOrSelf(cache as any);
    app.delete('/x/conv/:conversationId/participants/:userId', { preHandler: requireSelf }, async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: '/x/conv/c1/participants/u2', payload: { conversationId: 'c1' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('NOT_A_PARTICIPANT');
  });
});


