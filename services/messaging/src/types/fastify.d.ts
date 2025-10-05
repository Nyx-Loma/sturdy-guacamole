import 'fastify';
import type { MessagingMetrics } from '../observability/metrics';
import type { AuthContext } from '../domain/types/auth.types';
import type { MessagingConfig } from '../config';

declare module 'fastify' {
  interface FastifyInstance {
    messagingMetrics: MessagingMetrics;
    config?: MessagingConfig;
  }
  
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
