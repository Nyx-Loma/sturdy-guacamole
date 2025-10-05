import type { FastifyInstance } from 'fastify';
import type { MessagingMetrics } from '../observability/metrics';

declare module 'fastify' {
  interface FastifyRequest {
    metrics?: {
      startTime: bigint;
      route: string;
    };
    auth?: import('../domain/types/auth.types').AuthContext;
  }
  interface FastifyInstance {
    config?: import('../config').MessagingConfig;
    messagingMetrics?: MessagingMetrics;
  }
}

export const registerMetricsHooks = (app: FastifyInstance, metrics: MessagingMetrics) => {
  app.addHook('onRequest', async (request) => {
    request.metrics = {
      startTime: process.hrtime.bigint(),
      route: (request as { routerPath?: string }).routerPath ?? request.url
    };
  });

  app.addHook('onResponse', async (request, reply) => {
    if (!request.metrics) return;
    const duration = Number(process.hrtime.bigint() - request.metrics.startTime) / 1_000_000;
    const labels = {
      route: request.metrics.route,
      method: request.method,
      statusCode: reply.statusCode.toString()
    };
    metrics.requestCounter.labels(labels).inc();
    metrics.requestDurationMs.labels(labels).observe(duration);
  });
};

export const registerMetricsRoute = (app: FastifyInstance, metrics: MessagingMetrics) => {
  app.get('/metrics', async (request, reply) => {
    if (app.config?.NODE_ENV === 'production') {
      return reply.code(404).send();
    }
    reply.header('Content-Type', metrics.registry.contentType);
    reply.send(await metrics.registry.metrics());
  });
};


