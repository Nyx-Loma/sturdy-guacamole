import type { FastifyInstance } from 'fastify';
import { registerMessageRoutes } from './messages';
import { registerConversationRoutes } from './conversations';
import { registerParticipantRoutes } from './participants';

export const registerRoutes = (app: FastifyInstance) => {
  app.register(registerMessageRoutes, { prefix: '/v1/messages' });
  app.register(registerConversationRoutes, { prefix: '/v1/conversations' });
  app.register(registerParticipantRoutes, { prefix: '/v1' });
};
