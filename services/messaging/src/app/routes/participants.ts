import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { encodeCursor, parseCursor } from './schemas/cursor';
import {
  AddParticipantParamsSchema,
  AddParticipantBodySchema,
  RemoveParticipantParamsSchema,
  ListParticipantsParamsSchema,
  ListParticipantsQuerySchema,
  type AddParticipantResponse,
  type RemoveParticipantResponse,
  type ListParticipantsResponse,
} from './schemas/participants';

/**
 * Register participant management routes
 * Stage 3B implementation with versioned cache and pubsub invalidation
 */
export const registerParticipantRoutes = async (app: FastifyInstance) => {
  
  // ============================================================================
  // POST /v1/conversations/:conversationId/participants - Add participant
  // ============================================================================
  
  app.post<{
    Params: unknown;
    Body: unknown;
  }>('/v1/conversations/:conversationId/participants', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = AddParticipantParamsSchema.parse(request.params);
      const body = AddParticipantBodySchema.parse(request.body);

      // TODO: Check caller is admin via requireParticipant middleware (Stage 3D)
      
      // Check if already a participant
      // TODO: Query via port
      // const existing = await app.participantsReadPort.findByUserAndConversation(body.userId, params.conversationId);
      // if (existing && !existing.leftAt) {
      //   return reply.code(409).send({
      //     code: 'ALREADY_PARTICIPANT',
      //     message: 'User is already an active participant',
      //   });
      // }

      // Add participant via port
      // TODO: Replace with actual port call
      // const participant = await app.participantsWritePort.add({
      //   conversationId: params.conversationId,
      //   userId: body.userId,
      //   role: body.role,
      // });

      const participant = {
        userId: body.userId,
        role: body.role,
        joinedAt: new Date().toISOString(),
        leftAt: null,
      };

      // Invalidate participant cache
      // TODO: Increment version counter and publish invalidation
      // await app.participantCache.invalidate(params.conversationId);

      // Emit event for real-time notification
      // TODO: Emit participant_added event to conversation
      // await app.eventsPublisher.publish({
      //   type: 'participant_added',
      //   conversationId: params.conversationId,
      //   userId: body.userId,
      //   role: body.role,
      // });

      // Increment metrics
      app.messagingMetrics.participantsAddedTotal.inc();

      request.log.info({
        conversationId: params.conversationId,
        userId: body.userId,
        role: body.role,
      }, 'participant_added');

      const response: AddParticipantResponse = {
        participant,
      };

      return reply.code(201).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'participant_add_failed');
      throw error;
    }
  });

  // ============================================================================
  // DELETE /v1/conversations/:conversationId/participants/:userId - Remove
  // ============================================================================
  
  app.delete<{
    Params: unknown;
  }>('/v1/conversations/:conversationId/participants/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = RemoveParticipantParamsSchema.parse(request.params);

      // TODO: Check caller is admin OR removing self via requireParticipant middleware (Stage 3D)
      
      // Remove participant (set left_at)
      // TODO: Replace with actual port call
      // await app.participantsWritePort.remove({
      //   conversationId: params.conversationId,
      //   userId: params.userId,
      // });

      const leftAt = new Date().toISOString();

      // Check if last participant - if so, soft delete conversation
      // TODO: Query remaining participants
      // const remaining = await app.participantsReadPort.countActive(params.conversationId);
      // if (remaining === 0) {
      //   await app.conversationsWritePort.softDelete(params.conversationId);
      // }

      // Invalidate participant cache
      // TODO: Increment version counter and publish invalidation
      // await app.participantCache.invalidate(params.conversationId);

      // Emit event for real-time notification
      // TODO: Emit participant_removed event
      // await app.eventsPublisher.publish({
      //   type: 'participant_removed',
      //   conversationId: params.conversationId,
      //   userId: params.userId,
      // });

      // Increment metrics
      app.messagingMetrics.participantsRemovedTotal.inc();

      request.log.info({
        conversationId: params.conversationId,
        userId: params.userId,
        leftAt,
      }, 'participant_removed');

      const response: RemoveParticipantResponse = {
        removed: true,
        leftAt,
      };

      return reply.code(200).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'participant_remove_failed');
      throw error;
    }
  });

  // ============================================================================
  // GET /v1/conversations/:conversationId/participants - List participants
  // ============================================================================
  
  app.get<{
    Params: unknown;
    Querystring: unknown;
  }>('/v1/conversations/:conversationId/participants', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = ListParticipantsParamsSchema.parse(request.params);
      const query = ListParticipantsQuerySchema.parse(request.query);

      // Decode cursor if provided
      if (query.cursor) {
        try {
          const decoded = parseCursor(query.cursor);
          // TODO: Use decoded.ts and decoded.id for pagination
          void decoded;
        } catch {
          return reply.code(400).send({
            code: 'INVALID_CURSOR',
            message: 'Invalid cursor format',
            requestId: request.id,
          });
        }
      }

      // Fetch participants via port
      // TODO: Replace with actual port call
      // const participants = await app.participantsReadPort.list({
      //   conversationId: params.conversationId,
      //   limit: query.limit + 1,
      //   includeLeft: query.includeLeft,
      //   afterJoinedAt,
      //   afterUserId,
      // });

      // Temporary mock
      const participants = [];

      // Determine if there's a next page
      const hasMore = participants.length > query.limit;
      const items = hasMore ? participants.slice(0, query.limit) : participants;

      // Generate next cursor
      let nextCursor: string | null = null;
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1];
        nextCursor = encodeCursor(lastItem.joinedAt, lastItem.userId);
      }

      const response: ListParticipantsResponse = {
        participants: items,
        nextCursor,
      };

      return reply.code(200).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'participant_list_failed');
      throw error;
    }
  });
};

