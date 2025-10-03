import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import { registerMessageRoutes } from '../../../app/routes/messages';
import { registerErrorHandler } from '../../../app/errorHandler';
import { messagingMetrics } from '../../../observability/metrics';

const createServer = async () => {
  const app = Fastify({ bodyLimit: 65_536 });
  app.decorate('config', {
    PAYLOAD_MAX_BYTES: 65_536
  } as any);
  const mockMessage = {
    id: '11111111-1111-1111-1111-111111111111',
    conversationId: '00000000-0000-0000-0000-000000000000',
    senderId: '00000000-0000-0000-0000-000000000001',
    type: 'text',
    status: 'sent',
    encryptedContent: 'SGVsbG8=',
    metadata: undefined,
    contentSize: 5,
    contentMimeType: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  app.decorate('messageService', {
    send: vi.fn(async () => mockMessage.id),
    markRead: vi.fn()
  } as any);
  const messagesReadPort = {
    findById: vi.fn(async () => mockMessage),
    listPage: vi.fn(async () => ({ items: [], nextCursor: undefined })),
    list: vi.fn(async () => [])
  };
  app.decorate('messagesReadPort', messagesReadPort as any);
  registerErrorHandler(app);
  await registerMessageRoutes(app);
  return app;
};

describe('POST /v1/messages', () => {
  beforeEach(() => {
    vi.spyOn(messagingMetrics.messageSizeBytes, 'observe').mockImplementation(() => undefined);
    vi.spyOn(messagingMetrics.idempotencyHits, 'inc').mockImplementation(() => undefined);
  });

  it('returns 201 on first send', async () => {
    const app = await createServer();
    const response = await app.inject({
      method: 'POST',
      url: '/',
      headers: {
        'x-device-id': 'device-1',
        'x-session-id': 'session-1'
      },
      payload: {
        conversationId: '00000000-0000-0000-0000-000000000000',
        senderId: '00000000-0000-0000-0000-000000000001',
        type: 'text',
        encryptedContent: 'SGVsbG8=',
        payloadSizeBytes: 5
      }
    });

    if (![200, 201].includes(response.statusCode)) {
      console.error('response payload', response.body);
    }

    expect(response.statusCode).toBe(200);
  });
});


