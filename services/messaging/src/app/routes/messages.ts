import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { createMessageId, encodeCursor, parseCursor } from './schemas/cursor';
import {
  SendMessageRequestSchema,
  SendMessageResponseSchema,
  GetMessageParamsSchema,
  ListMessagesParamsSchema,
  ListMessagesQuerySchema,
  ListMessagesResponseSchema,
  MarkReadRequestSchema,
  MarkReadResponseSchema
} from './schemas/messages';
import { messagingMetrics } from '../../observability/metrics';
import { PayloadValidationError } from '../../domain/errors';

export const registerMessageRoutes = async (app: FastifyInstance) => {
  app.post('/', {
    schema: {
      description: 'Send an end-to-end encrypted message',
      tags: ['messages'],
      security: [{ bearerAuth: [] }],
      headers: {
        type: 'object',
        properties: {
          'idempotency-key': { type: 'string', format: 'uuid', description: 'Optional UUID for idempotent sends' },
          'x-device-id': { type: 'string', description: 'Device identifier' },
          'x-session-id': { type: 'string', description: 'Session identifier' },
        },
      },
      body: {
        type: 'object',
        required: ['conversationId', 'senderId', 'type', 'encryptedContent', 'payloadSizeBytes'],
        properties: {
          conversationId: { type: 'string', format: 'uuid', description: 'Conversation UUID' },
          senderId: { type: 'string', format: 'uuid', description: 'Sender user UUID' },
          type: { type: 'string', enum: ['text', 'image', 'file', 'audio', 'video'], description: 'Message type' },
          encryptedContent: { type: 'string', description: 'Base64-encoded encrypted payload' },
          payloadSizeBytes: { type: 'number', description: 'Size in bytes of the encrypted content' },
          contentMimeType: { type: 'string', description: 'MIME type of decrypted content' },
          metadata: { type: 'object', description: 'Optional encrypted metadata' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            conversationId: { type: 'string', format: 'uuid' },
            senderId: { type: 'string', format: 'uuid' },
            type: { type: 'string' },
            encryptedContent: { type: 'string' },
            contentSize: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            seq: { type: 'number' },
          },
        },
        200: {
          description: 'Idempotent replay of previously sent message',
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            conversationId: { type: 'string', format: 'uuid' },
            senderId: { type: 'string', format: 'uuid' },
            type: { type: 'string' },
            encryptedContent: { type: 'string' },
            contentSize: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            seq: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const params = SendMessageRequestSchema.parse({
      body: request.body,
      headers: request.headers
    });

    enforcePayloadLimits(params.body.payloadSizeBytes, app);
    const encryptedBytes = Buffer.from(params.body.encryptedContent, 'base64');
    if (encryptedBytes.toString('base64') !== params.body.encryptedContent) {
      messagingMetrics.payloadRejects.inc({ reason: 'base64' });
      throw new PayloadValidationError('encryptedContent is not valid base64');
    }
    if (encryptedBytes.length !== params.body.payloadSizeBytes) {
      messagingMetrics.payloadRejects.inc({ reason: 'size_mismatch' });
      throw new PayloadValidationError('payloadSizeBytes mismatch with encrypted content length');
    }
    const fingerprint = app.config.ENABLE_PAYLOAD_FINGERPRINT ? createFingerprint(encryptedBytes) : undefined;

    const proposedId = createMessageId();
    const command = {
      input: {
        conversationId: params.body.conversationId,
        senderId: params.body.senderId,
        type: params.body.type,
        encryptedContent: params.body.encryptedContent,
        metadata: params.body.metadata,
        contentSize: params.body.payloadSizeBytes,
        contentMimeType: params.body.contentMimeType,
        fingerprint
      },
      idempotencyKey: params.headers['idempotency-key']
    };

    const actor = {
      id: params.body.senderId,
      role: 'user' as const,
      deviceId: params.headers['x-device-id'],
      sessionId: params.headers['x-session-id']
    };

    const firstMessageId = await app.messageService.send(command, actor, { messageId: proposedId });

    const message = await app.messagesReadPort.findById(firstMessageId);
    const isReplay = firstMessageId !== proposedId;

    metricsForSend(message?.contentSize ?? 0, isReplay);

    if (!message) {
      throw new PayloadValidationError('Failed to load persisted message', 500);
    }

    const response = SendMessageResponseSchema.parse({
      status: isReplay ? 200 : 201,
      message
    });

    reply
      .code(response.status)
      .header('Location', `/v1/messages/${message.id}`)
      .header('Idempotent-Replay', String(isReplay))
      .send(response.message);
  });

  app.get('/:messageId', async (request, reply) => {
    const params = GetMessageParamsSchema.parse(request.params);
    const message = await app.messagesReadPort.findById(params.messageId);
    if (!message) {
      throw new PayloadValidationError('Message not found', 404);
    }
    reply.send(message);
  });

  app.get('/:messageId/conversation', async (request, reply) => {
    const params = GetMessageParamsSchema.parse(request.params);
    const message = await app.messagesReadPort.findById(params.messageId);
    if (!message) {
      throw new PayloadValidationError('Message not found', 404);
    }
    reply.send({ conversationId: message.conversationId });
  });

  app.get('/conversation/:conversationId', async (request, reply) => {
    const params = ListMessagesParamsSchema.parse(request.params);
    const query = ListMessagesQuerySchema.parse(request.query);

    const cursor = parseCursor(query.cursor);
    const page = await app.messagesReadPort.listPage(
      {
        conversationId: params.conversationId,
        senderId: query.senderId,
        status: query.status,
        type: query.type,
        before: cursor?.before ?? query.before,
        after: cursor?.after ?? query.after,
        includeDeleted: query.includeDeleted
      },
      cursor?.token,
      query.limit
    );

    const response = ListMessagesResponseSchema.parse({
      items: page.items,
      nextCursor: encodeCursor(query, page.nextCursor)
    });

    reply.send(response);
  });

  app.post('/read', async (request, reply) => {
    const body = MarkReadRequestSchema.parse(request.body);
    if (body.messageIds.length === 0) {
      return reply.send({ updated: 0 });
    }

    const actor = {
      id: body.actorId,
      role: 'user' as const,
      deviceId: request.headers['x-device-id']?.toString(),
      sessionId: request.headers['x-session-id']?.toString()
    };

    await app.messageService.markRead(body.messageIds, body.readAt, actor);

    messagingMetrics.markReadUpdates.inc(body.messageIds.length);

    const response = MarkReadResponseSchema.parse({ updated: body.messageIds.length });
    reply.send(response);
  });
};

const enforcePayloadLimits = (size: number | undefined, app: FastifyInstance) => {
  if (!size) return;
  const max = loadPayloadCap(app);
  if (size > max) {
    messagingMetrics.payloadRejects.inc({ reason: 'size' });
    throw new PayloadValidationError(`payload exceeds maximum of ${max} bytes`, 413);
  }
};

const loadPayloadCap = (app: FastifyInstance): number => app.config.PAYLOAD_MAX_BYTES;

const metricsForSend = (size: number, replay: boolean) => {
  if (size > 0) {
    messagingMetrics.messageSizeBytes.observe(size);
  }
  if (replay) {
    messagingMetrics.idempotencyHits.inc();
  }
};

const createFingerprint = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('base64url');


