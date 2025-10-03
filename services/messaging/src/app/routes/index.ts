import type { FastifyInstance } from 'fastify';
import { registerMessageRoutes } from './messages';
import { registerConversationRoutes } from './conversations';

export const registerRoutes = (app: FastifyInstance) => {
  app.register(registerMessageRoutes, { prefix: '/v1/messages' });
  app.register(registerConversationRoutes, { prefix: '/v1/conversations' });
};


