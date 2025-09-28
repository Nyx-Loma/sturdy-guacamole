import type { FastifyInstance } from 'fastify';
import { register } from 'prom-client';
import { requestDurationHistogram, requestTotalCounter } from '../observability/metrics';

export const registerMetrics = (app: FastifyInstance) => {
  app.addHook('onRequest', async (request) => {
    request.metrics = {
      startTime: process.hrtime.bigint()
    };
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routerPath ?? request.url;
    requestTotalCounter.labels({ route, method: request.method }).inc();

    if (request.metrics?.startTime) {
      const duration = Number(process.hrtime.bigint() - request.metrics.startTime) / 1_000_000;
      requestDurationHistogram.labels({ route, method: request.method, status_code: String(reply.statusCode) }).observe(duration);
    }
  });

  app.get('/metrics', async (request, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(404).send();
    }
    reply.type('text/plain');
    return register.metrics();
  });
};

declare module 'fastify' {
  interface FastifyRequest {
    metrics?: {
      startTime: bigint;
    };
  }
}


