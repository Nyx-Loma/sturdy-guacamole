import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { parseCursor } from './schemas/cursor';
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
  const requireAdmin = app.participantEnforcement?.requireAdmin;
  const requireParticipantOrSelf = app.participantEnforcement?.requireParticipantOrSelf;

  const withAdminGuard = <T extends FastifyRequest = FastifyRequest>(handler: (request: T, reply: FastifyReply) => Promise<FastifyReply | void>) => {
    if (!requireAdmin) return handler;
    return async (request: T, reply: FastifyReply) => {
      await requireAdmin(request, reply);
      if (reply.sent) return;
      return handler(request, reply);
    };
  };

  const withParticipantOrSelfGuard = <T extends FastifyRequest = FastifyRequest>(handler: (request: T, reply: FastifyReply) => Promise<FastifyReply | void>) => {
    if (!requireParticipantOrSelf) return handler;
    return async (request: T, reply: FastifyReply) => {
      await requireParticipantOrSelf(request, reply);
      if (reply.sent) return;
      return handler(request, reply);
    };
  };

  const actorFromRequest = (request: FastifyRequest) => {
    const auth = (request as { auth?: import('../../domain/types/auth.types').AuthContext }).auth;
    if (!auth) return { id: 'system', role: 'system' as const };
    return { id: auth.userId, role: 'member' as const, deviceId: auth.deviceId, sessionId: auth.sessionId };
  };

  const mapParticipant = (participant: { userId: string; role: string; joinedAt: string; leftAt?: string | null }) => ({
    userId: participant.userId,
    role: participant.role === 'owner' || participant.role === 'admin' ? 'admin' : 'member',
    joinedAt: participant.joinedAt,
    leftAt: participant.leftAt ?? null,
  });

  const loadParticipants = async (conversationId: string) => {
    const conversation = await app.conversationsReadPort.findById(conversationId);
    if (!conversation) return null;
    return conversation.participants;
  };

  const findParticipant = async (conversationId: string, userId: string) => {
    const participants = await loadParticipants(conversationId);
    if (!participants) return null;
    return participants.find((participant) => participant.userId === userId && !participant.leftAt) ?? null;
  };

  // ============================================================================
  // POST /v1/conversations/:conversationId/participants - Add participant
  // ============================================================================

  const addParticipantHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsResult = AddParticipantParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid parameters',
          requestId: request.id,
        });
      }
      const bodyResult = AddParticipantBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid body payload',
          requestId: request.id,
        });
      }
      const params = paramsResult.data;
      const body = bodyResult.data;

      const actor = actorFromRequest(request);

      const existingParticipants = await loadParticipants(params.conversationId);
      if (!existingParticipants) {
        return reply.code(404).send({
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
          requestId: request.id,
        });
      }

      const alreadyParticipant = existingParticipants.find((participant) => participant.userId === body.userId && !participant.leftAt);
      if (alreadyParticipant) {
        return reply.code(409).send({
          code: 'ALREADY_PARTICIPANT',
          message: 'User is already an active participant',
          requestId: request.id,
        });
      }

      await app.conversationService.addParticipants(
        params.conversationId,
        [{ userId: body.userId, role: body.role }],
        actor,
      );

      await app.participantCache.invalidate(params.conversationId);
      app.messagingMetrics.participantsAddedTotal.inc({ role: body.role });

      request.log.info({
        conversationId: params.conversationId,
        userId: body.userId,
        role: body.role,
      }, 'participant_added');

      const page = await app.conversationService.listParticipants(params.conversationId, {
        limit: 1,
        includeLeft: true,
      });
      const participant = page.items.find((p) => p.userId === body.userId) ?? {
        userId: body.userId,
        role: body.role,
        joinedAt: new Date().toISOString(),
        leftAt: undefined,
      };

      const response: AddParticipantResponse = {
        participant: mapParticipant(participant),
      };

      return reply.code(201).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'participant_add_failed');
      throw error;
    }
  };

  app.post<{ Params: unknown; Body: unknown }>('/conversations/:conversationId/participants', withAdminGuard(addParticipantHandler));

  // ============================================================================
  // DELETE /v1/conversations/:conversationId/participants/:userId - Remove
  // ============================================================================
  
  const removeParticipantHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsResult = RemoveParticipantParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid parameters',
          requestId: request.id,
        });
      }
      const params = paramsResult.data;

      const actor = actorFromRequest(request);

      const target = await findParticipant(params.conversationId, params.userId);
      if (!target) {
        return reply.code(404).send({
          code: 'PARTICIPANT_NOT_FOUND',
          message: 'Participant not found',
          requestId: request.id,
        });
      }

      await app.conversationService.removeParticipant(
        params.conversationId,
        params.userId,
        actor,
      );

      await app.participantCache.invalidate(params.conversationId);
      app.messagingMetrics.participantsRemovedTotal.inc({ role: target.role });

      request.log.info({
        conversationId: params.conversationId,
        userId: params.userId,
        role: target.role,
      }, 'participant_removed');

      const refreshedParticipants = await loadParticipants(params.conversationId);
      const removedParticipant = refreshedParticipants?.find((p) => p.userId === params.userId);

      const response: RemoveParticipantResponse = {
        removed: true,
        leftAt: removedParticipant?.leftAt ?? new Date().toISOString(),
      };

      return reply.code(200).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'participant_remove_failed');
      throw error;
    }
  };

  app.delete<{ Params: unknown }>('/conversations/:conversationId/participants/:userId', withParticipantOrSelfGuard(removeParticipantHandler));

  // ============================================================================
  // GET /v1/conversations/:conversationId/participants - List participants
  // ============================================================================
  
  app.get<{
    Params: unknown;
    Querystring: unknown;
  }>('/conversations/:conversationId/participants', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const paramsResult = ListParticipantsParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid parameters',
          requestId: request.id,
        });
      }

      const queryResult = ListParticipantsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid querystring',
          requestId: request.id,
        });
      }

      const params = paramsResult.data;
      const query = queryResult.data;

      // Decode cursor if provided
      if (query.cursor) {
        try {
          const decoded = parseCursor(query.cursor);
          query.cursor = decoded.token ?? undefined;
        } catch {
          return reply.code(400).send({
            code: 'INVALID_CURSOR',
            message: 'Invalid cursor format',
            requestId: request.id,
          });
        }
      }

      const result = await app.conversationService.listParticipants(
        params.conversationId,
        {
          limit: query.limit,
          cursor: query.cursor,
          includeLeft: query.includeLeft,
        }
      );

      const response: ListParticipantsResponse = {
        participants: result.items.map((p) => mapParticipant(p)),
        nextCursor: result.nextCursor ?? null,
      };

      return reply.code(200).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'participant_list_failed');
      throw error;
    }
  });
};

