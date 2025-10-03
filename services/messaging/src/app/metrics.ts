import type { FastifyInstance } from 'fastify';
import { metricsRegistry, messagingMetrics } from '../observability/metrics';

declare module 'fastify' {
  interface FastifyRequest {
    metrics?: {
      startTime: bigint;
      route: string;
    };
  }
  interface FastifyInstance {
    config?: import('../config').MessagingConfig;
  }
}

export const registerMetricsHooks = (app: FastifyInstance) => {
  app.addHook('onRequest', async (request) => {
    request.metrics = {
      startTime: process.hrtime.bigint(),
      route: request.routerPath ?? request.url
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
    messagingMetrics.requestCounter.labels(labels).inc();
    messagingMetrics.requestDurationMs.labels(labels).observe(duration);
  });
};

export const registerMetricsRoute = (app: FastifyInstance) => {
  app.get('/metrics', async (request, reply) => {
    if (app.config?.NODE_ENV === 'production') {
      return reply.code(404).send();
    }
    reply.header('Content-Type', metricsRegistry.contentType);
    reply.send(await metricsRegistry.metrics());
  });
};


