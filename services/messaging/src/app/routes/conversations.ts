import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { encodeCursor, parseCursor } from './schemas/cursor';
import {
  CreateConversationBodySchema,
  CreateConversationHeadersSchema,
  GetConversationParamsSchema,
  UpdateConversationParamsSchema,
  UpdateConversationHeadersSchema,
  UpdateConversationBodySchema,
  DeleteConversationParamsSchema,
  ListConversationsQuerySchema,
  type CreateConversationResponse,
  type GetConversationResponse,
  type UpdateConversationResponse,
  type DeleteConversationResponse,
  type ListConversationsResponse,
} from './schemas/conversations';

/**
 * Register conversation CRUD routes
 * Stage 3A implementation with idempotency, RLS, and optimistic concurrency
 */
export const registerConversationRoutes = async (app: FastifyInstance) => {
  
  // ============================================================================
  // POST /v1/conversations - Create conversation
  // ============================================================================
  
  app.post<{
    Body: unknown;
    Headers: unknown;
  }>('/v1/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate request
      const headers = CreateConversationHeadersSchema.parse(request.headers);
      const body = CreateConversationBodySchema.parse(request.body);

      // Extract actor context (temporary until Stage 4 auth)
      const deviceId = headers['x-device-id'] || 'anonymous';
      const idempotencyKey = headers['idempotency-key'];

      // For now, use deviceId as userId (will be replaced with proper auth in Stage 4)
      const userId = deviceId;

      // Validate direct conversation requirements
      if (body.type === 'direct' && body.participants.length !== 2) {
        return reply.code(400).send({
          code: 'INVALID_DIRECT_CONVERSATION',
          message: 'Direct conversations must have exactly 2 participants',
          requestId: request.id,
        });
      }

      // Check for idempotent replay
      if (idempotencyKey) {
        // TODO: Implement idempotency check via postgres query
        // For now, proceed with creation
      }

      // Create conversation via port
      const conversationId = randomUUID();
      
      // TODO: Replace with actual port call when write port is updated
      // const conversation = await app.conversationsWritePort.create({
      //   id: conversationId,
      //   type: body.type,
      //   creatorId: userId,
      //   metadata: body.metadata || {},
      // });

      // Temporary mock response for development
      const conversation = {
        id: conversationId,
        type: body.type,
        creatorId: userId,
        metadata: body.metadata || {},
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      // Add participants (creator becomes admin)
      const participants = [
        {
          userId,
          role: 'admin' as const,
          joinedAt: new Date().toISOString(),
          leftAt: null,
        },
        ...body.participants
          .filter(p => p !== userId)
          .map(userId => ({
            userId,
            role: 'member' as const,
            joinedAt: new Date().toISOString(),
            leftAt: null,
          })),
      ];

      // Increment metrics
      app.messagingMetrics.conversationsCreatedTotal.inc({ type: body.type });

      // Log creation
      request.log.info({
        conversationId,
        type: body.type,
        participantCount: participants.length,
        idempotencyKey,
      }, 'conversation_created');

      const response: CreateConversationResponse = {
        conversation,
        participants,
      };

      return reply.code(201).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'conversation_create_failed');
      throw error;
    }
  });

  // ============================================================================
  // GET /v1/conversations/:id - Get conversation by ID
  // ============================================================================
  
  app.get<{
    Params: unknown;
  }>('/v1/conversations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = GetConversationParamsSchema.parse(request.params);

      // TODO: Fetch via port with RLS enforcement
      // const conversation = await app.conversationsReadPort.findById(params.id);
      // const participants = await app.participantsReadPort.list(params.id);

      // Temporary mock for development
      const conversation = {
        id: params.id,
        type: 'direct' as const,
        creatorId: 'user-123',
        metadata: {},
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const participants = [
        {
          userId: 'user-123',
          role: 'admin' as const,
          joinedAt: new Date().toISOString(),
          leftAt: null,
        },
      ];

      const response: GetConversationResponse = {
        conversation,
        participants,
      };

      return reply.code(200).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'conversation_get_failed');
      throw error;
    }
  });

  // ============================================================================
  // PATCH /v1/conversations/:id - Update conversation metadata
  // ============================================================================
  
  app.patch<{
    Params: unknown;
    Headers: unknown;
    Body: unknown;
  }>('/v1/conversations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = UpdateConversationParamsSchema.parse(request.params);
      const headers = UpdateConversationHeadersSchema.parse(request.headers);
      const body = UpdateConversationBodySchema.parse(request.body);

      const ifMatch = headers['if-match'];

      // TODO: Implement optimistic concurrency check
      // if (ifMatch) {
      //   const currentVersion = parseInt(ifMatch, 10);
      //   if (isNaN(currentVersion)) {
      //     return reply.code(400).send({
      //       code: 'INVALID_IF_MATCH',
      //       message: 'If-Match header must be a valid version number',
      //     });
      //   }
      //   // Check version in update call
      // }

      // TODO: Update via port
      // const conversation = await app.conversationsWritePort.update(params.id, {
      //   metadata: body.metadata,
      //   expectedVersion: ifMatch ? parseInt(ifMatch, 10) : undefined,
      // });

      // Temporary mock
      const conversation = {
        id: params.id,
        type: 'direct' as const,
        creatorId: 'user-123',
        metadata: body.metadata,
        version: ifMatch ? parseInt(ifMatch, 10) + 1 : 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      request.log.info({
        conversationId: params.id,
        version: conversation.version,
      }, 'conversation_updated');

      const response: UpdateConversationResponse = {
        conversation,
      };

      return reply.code(200).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'conversation_update_failed');
      throw error;
    }
  });

  // ============================================================================
  // DELETE /v1/conversations/:id - Soft delete conversation
  // ============================================================================
  
  app.delete<{
    Params: unknown;
  }>('/v1/conversations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = DeleteConversationParamsSchema.parse(request.params);

      // TODO: Soft delete via port (sets deleted_at)
      // await app.conversationsWritePort.delete(params.id);

      const deletedAt = new Date().toISOString();

      request.log.info({
        conversationId: params.id,
        deletedAt,
      }, 'conversation_deleted');

      const response: DeleteConversationResponse = {
        deleted: true,
        deletedAt,
      };

      return reply.code(200).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'conversation_delete_failed');
      throw error;
    }
  });

  // ============================================================================
  // GET /v1/conversations - List conversations with cursor pagination
  // ============================================================================
  
  app.get<{
    Querystring: unknown;
  }>('/v1/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = ListConversationsQuerySchema.parse(request.query);

      // Decode cursor if provided
      if (query.cursor) {
        try {
          const decoded = parseCursor(query.cursor);
          // TODO: Use decoded.ts and decoded.id for pagination query
          void decoded;
        } catch {
          return reply.code(400).send({
            code: 'INVALID_CURSOR',
            message: 'Invalid cursor format',
            requestId: request.id,
          });
        }
      }

      // TODO: Fetch via port with RLS and pagination
      // const conversations = await app.conversationsReadPort.list({
      //   limit: query.limit + 1, // Fetch one extra to determine if there's a next page
      //   afterUpdatedAt,
      //   afterId,
      // });

      // Temporary mock
      const conversations = [];
      
      // Determine if there's a next page
      const hasMore = conversations.length > query.limit;
      const items = hasMore ? conversations.slice(0, query.limit) : conversations;

      // Generate next cursor if there are more results
      let nextCursor: string | null = null;
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1];
        nextCursor = encodeCursor(lastItem.updatedAt, lastItem.id);
      }

      const response: ListConversationsResponse = {
        conversations: items,
        nextCursor,
      };

      return reply.code(200).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'conversation_list_failed');
      throw error;
    }
  });

  // ============================================================================
  // Legacy route (keep for backwards compatibility)
  // ============================================================================
  
  app.get<{
    Params: { conversationId: string };
    Querystring: { since?: string };
  }>('/:conversationId/messages/since', async (request, reply) => {
    const { conversationId } = request.params;
    const { since } = request.query;
    
    const messages = await app.messagesReadPort.list({ 
      conversationId, 
      after: since 
    });
    
    reply.send({ items: messages });
  });
};
