import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const ConversationParamsSchema = z.object({ conversationId: z.string().uuid() });

export const registerConversationRoutes = async (app: FastifyInstance) => {
  app.get('/:conversationId/messages/since', async (request, reply) => {
    const params = ConversationParamsSchema.parse(request.params);
    const since = z
      .string()
      .datetime()
      .optional()
      .parse(typeof request.query === 'object' && request.query !== null ? (request.query as Record<string, unknown>).since : undefined);
    const messages = await app.messagesReadPort.list({ conversationId: params.conversationId, after: since });
    reply.send({ items: messages });
  });
};


