import { vi } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from '../../../app/routes';
import { loadConfig, resetConfigForTests } from '../../../config';

export const TEST_CONVERSATION_ID = '00000000-0000-0000-0000-000000000000';
export const TEST_MESSAGE_ID = '00000000-0000-0000-0000-000000000001';
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';

const createConversationMock = (id: string = TEST_CONVERSATION_ID, ownerId: string = TEST_USER_ID) => ({
  id,
  type: 'group',
  name: null,
  description: null,
  avatarUrl: null,
  participants: [
    {
      userId: ownerId,
      role: 'owner',
      joinedAt: new Date().toISOString(),
      leftAt: null,
    }
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

const createMessageMock = (id: string = TEST_MESSAGE_ID, conversationId: string = TEST_CONVERSATION_ID, senderId: string = TEST_USER_ID) => ({
  id,
  conversationId,
  senderId,
  type: 'text',
  status: 'sent',
  encryptedContent: 'AA==',
  contentSize: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

interface TestServerOptions {
  injectAuth?: boolean;
  conversationId?: string;
  messageId?: string;
  userId?: string;
}

export const createTestMessagingServer = async (options: TestServerOptions = {}) => {
  const {
    injectAuth = true,
    conversationId = TEST_CONVERSATION_ID,
    messageId = TEST_MESSAGE_ID,
    userId = TEST_USER_ID,
  } = options;

  resetConfigForTests();
  process.env.JWT_PUBLIC_KEY ??= '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAMOCKx2qCk41sJLdnOjFkMrDXLI4YAln\n4jKAmhpX6wX+ZspGDZsBoBPXaAgNsq4CPGK/c/pX9nuSUXGMWzMEuziUCAwEAAQ==\n-----END PUBLIC KEY-----';
  process.env.JWT_ISSUER ??= 'test-issuer';
  process.env.JWT_AUDIENCE ??= 'test-audience';

  const config = loadConfig();
  const app = Fastify();
  app.decorate('config', config);

  if (injectAuth) {
    app.addHook('preHandler', (request, _reply, done) => {
      (request as { auth?: { userId: string; deviceId: string; sessionId: string; scope: string[]; issuedAt: number; expiresAt: number } }).auth = {
        userId,
        deviceId: 'auth-device',
        sessionId: 'auth-session',
        scope: [],
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      done();
    });
  }

  const messagingMetrics = {
    conversationsCreatedTotal: { inc: vi.fn() },
    conversationsDeletedTotal: { inc: vi.fn() },
    conversationVersionConflicts: { inc: vi.fn() },
    participantsAddedTotal: { inc: vi.fn() },
    participantsRemovedTotal: { inc: vi.fn() },
    markReadUpdates: { inc: vi.fn(() => 0) },
    payloadRejects: { inc: vi.fn() },
    messageSizeBytes: { observe: vi.fn() },
    idempotencyHits: { inc: vi.fn() },
  } as const;
  app.decorate('messagingMetrics', messagingMetrics);

  const conversationsWritePort = {
    create: vi.fn().mockResolvedValue(conversationId),
    updateMetadata: vi.fn(),
    softDelete: vi.fn(),
  };
  const conversationsReadPort = {
    findById: vi.fn().mockResolvedValue(createConversationMock(conversationId, userId)),
    listPage: vi.fn().mockResolvedValue({ items: [createConversationMock(conversationId, userId)], nextCursor: undefined }),
  };
  const participantsReadPort = {
    findByUserAndConversation: vi.fn().mockResolvedValue(null),
    countActive: vi.fn().mockResolvedValue(1),
    listPage: vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    }),
  };
  const participantsWritePort = {
    add: vi.fn(),
    remove: vi.fn(),
  };
  const messagesReadPort = {
    findById: vi.fn().mockResolvedValue(createMessageMock(messageId, conversationId, userId)),
    listPage: vi.fn().mockResolvedValue({ items: [createMessageMock(messageId, conversationId, userId)], nextCursor: undefined }),
  };
  const messagesWritePort = {
    create: vi.fn(),
    markAsRead: vi.fn(),
  };
  const messageService = {
    send: vi.fn().mockResolvedValue(messageId),
    markRead: vi.fn(),
  };
  const conversationService = {
    create: vi.fn().mockResolvedValue(conversationId),
    updateMetadata: vi.fn(),
    softDelete: vi.fn(),
    addParticipants: vi.fn(),
    removeParticipant: vi.fn(),
    listParticipants: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  };
  app.decorate('conversationsWritePort', conversationsWritePort);
  app.decorate('conversationsReadPort', conversationsReadPort);
  app.decorate('participantsReadPort', participantsReadPort);
  app.decorate('participantsWritePort', participantsWritePort as never);
  app.decorate('messagesReadPort', messagesReadPort);
  app.decorate('messagesWritePort', messagesWritePort);
  app.decorate('messageService', messageService);
  app.decorate('conversationService', conversationService);
  app.decorate('participantCache', {
    invalidate: vi.fn(),
  } as never);
  app.decorate('participantEnforcement', {
    requireAdmin: vi.fn(async () => undefined),
    requireParticipantOrSelf: vi.fn(async () => undefined),
  } as never);

  await registerRoutes(app);

  return Object.assign(app, {
    conversationsWritePort,
    conversationsReadPort,
    participantsReadPort,
    participantsWritePort,
    messagesReadPort,
    messagesWritePort,
    messageService,
    conversationService,
    participantCache: app.participantCache,
    participantEnforcement: app.participantEnforcement,
    messagingMetrics,
  });
};
