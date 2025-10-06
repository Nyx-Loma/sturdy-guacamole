import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseCursor } from './schemas/cursor';
import {
  CreateConversationBodySchema,
  CreateConversationHeadersSchema,
  DeleteConversationParamsSchema,
  GetConversationParamsSchema,
  ListConversationsQuerySchema,
  UpdateConversationBodySchema,
  UpdateConversationHeadersSchema,
  UpdateConversationParamsSchema,
  type CreateConversationResponse,
  type DeleteConversationResponse,
  type GetConversationResponse,
  type ListConversationsResponse,
  type UpdateConversationResponse,
} from './schemas/conversations';
import type { AuthContext } from '../../domain/types/auth.types';
import { convertAuthToActor } from '../../domain/utils/auth';
import { mapConversationResponse, mapParticipantsResponse } from './mappers';

const UNAUTHORIZED = {
  code: 'UNAUTHORIZED',
  message: 'Missing authentication',
};

const ensureAuth = (request: FastifyRequest, reply: FastifyReply): AuthContext | null => {
  const auth = (request as { auth?: AuthContext }).auth;
  if (!auth) {
    void reply.code(401).send({ ...UNAUTHORIZED, requestId: request.id });
    return null;
  }
  return auth;
};

export const registerConversationRoutes = async (app: FastifyInstance) => {
  app.post('/', async (request, reply) => {
    const headers = CreateConversationHeadersSchema.parse(request.headers);
    const body = CreateConversationBodySchema.parse(request.body);
    const auth = ensureAuth(request, reply);
    if (!auth) return;

    if (body.type === 'direct' && body.participants.length !== 2) {
      return reply.code(400).send({
        code: 'INVALID_DIRECT_CONVERSATION',
        message: 'Direct conversations must have exactly 2 participants',
        requestId: request.id,
      });
    }

    const actor = convertAuthToActor(auth);

    try {
      const conversationId = await app.conversationsWritePort.create({
        type: body.type,
        participantIds: body.participants,
        metadata: body.metadata ?? {},
        idempotencyKey: headers['idempotency-key'],
      }, actor);

      const conversation = await app.conversationsReadPort.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation created but not found');
      }

      app.messagingMetrics.conversationsCreatedTotal.inc({ type: body.type });

      const response: CreateConversationResponse = {
        conversation: mapConversationResponse(conversation),
        participants: mapParticipantsResponse(conversation.participants),
      };

      return reply.code(201).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'conversation_create_failed');
      throw error;
    }
  });

  app.get('/:id', async (request, reply) => {
    const params = GetConversationParamsSchema.parse(request.params);
    const auth = ensureAuth(request, reply);
    if (!auth) return;

    const conversation = await app.conversationsReadPort.findById(params.id);
    if (!conversation) {
      return reply.code(404).send({
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
        requestId: request.id,
      });
    }

    const response: GetConversationResponse = {
      conversation: mapConversationResponse(conversation),
      participants: mapParticipantsResponse(conversation.participants),
    };

    return reply.code(200).send(response);
  });

  app.patch('/:id', async (request, reply) => {
    const params = UpdateConversationParamsSchema.parse(request.params);
    const headers = UpdateConversationHeadersSchema.parse(request.headers);
    const body = UpdateConversationBodySchema.parse(request.body);
    const auth = ensureAuth(request, reply);
    if (!auth) return;

    const actor = convertAuthToActor(auth);
    const expectedVersion = headers['if-match'] ? Number.parseInt(headers['if-match'], 10) : undefined;
    if (headers['if-match'] && Number.isNaN(expectedVersion)) {
      return reply.code(400).send({
        code: 'INVALID_IF_MATCH',
        message: 'If-Match must be a valid integer version',
        requestId: request.id,
      });
    }

    try {
      await app.conversationsWritePort.updateMetadata(params.id, {
        name: body.metadata.name,
        description: body.metadata.description,
        avatarUrl: body.metadata.avatar,
        custom: body.metadata.custom,
        expectedVersion,
      }, actor);

      const conversation = await app.conversationsReadPort.findById(params.id);
      if (!conversation) {
        return reply.code(404).send({
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
          requestId: request.id,
        });
      }

      const response: UpdateConversationResponse = {
        conversation: mapConversationResponse(conversation),
      };
      return reply.code(200).send(response);
    } catch (error) {
      if ((error as Error & { code?: string }).code === 'VERSION_CONFLICT') {
        app.messagingMetrics.conversationVersionConflicts.inc();
        return reply.code(409).send({
          code: 'VERSION_CONFLICT',
          message: 'Conversation version mismatch',
          requestId: request.id,
        });
      }
      request.log.error({ err: error }, 'conversation_update_failed');
      throw error;
    }
  });

  app.delete('/:id', async (request, reply) => {
    const params = DeleteConversationParamsSchema.parse(request.params);
    const auth = ensureAuth(request, reply);
    if (!auth) return;

    const actor = convertAuthToActor(auth);
    const timestamp = new Date().toISOString();

    await app.conversationsWritePort.softDelete(params.id, timestamp, actor);
    app.messagingMetrics.conversationsDeletedTotal.inc();

    const response: DeleteConversationResponse = {
      deleted: true,
      deletedAt: timestamp,
    };
    return reply.code(200).send(response);
  });

  app.get('/', async (request, reply) => {
    const query = ListConversationsQuerySchema.parse(request.query);
    const auth = ensureAuth(request, reply);
    if (!auth) return;

    let cursorId: string | undefined;
    if (query.cursor) {
      try {
        const decoded = parseCursor(query.cursor);
        cursorId = decoded.id;
      } catch (error) {
        request.log.warn({ err: error, cursor: query.cursor }, 'conversation_list_invalid_cursor');
        return reply.code(400).send({
          code: 'INVALID_CURSOR',
          message: 'Cursor format invalid',
          requestId: request.id,
        });
      }
    }

    const page = await app.conversationsReadPort.listPage({
      participantId: auth.userId,
      includeDeleted: false,
    }, cursorId, query.limit);

    const response: ListConversationsResponse = {
      conversations: page.items.map(mapConversationResponse),
      nextCursor: page.nextCursor ?? null,
    };

    return reply.code(200).send(response);
  });
};
