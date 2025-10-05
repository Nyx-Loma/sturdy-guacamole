import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config';
import { registerMetricsRoute } from './metrics';
import { createMessagingServer } from './buildServer';

export interface MessagingServer {
  app: FastifyInstance;
  start(): Promise<void>;
  stop(): Promise<void>;
  setReady(ready: boolean): void;
}

let isReady = false;

export const createServer = async (): Promise<MessagingServer> => {
  const config = loadConfig();
  const { app, container, dispatcherRunner } = await createMessagingServer({ config });

  registerSecurityHeaders(app);
  registerMetricsRoute(app);

  // Readiness probe - flips to false during shutdown
  app.get('/ready', async () => {
    if (!isReady) {
      return { ready: false, code: 503 };
    }
    return { ready: true };
  });

  return {
    app,
    async start() {
      await container.init();
      if (dispatcherRunner) {
        await dispatcherRunner.start();
      }
      if (container.consumer) {
        await container.consumer.start();
      }
      await app.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT });
      isReady = true;
      app.log.info(`📚 OpenAPI documentation available at http://${config.HTTP_HOST}:${config.HTTP_PORT}/docs`);
    },
    async stop() {
      app.log.info('Starting graceful shutdown sequence...');
      
      // 1. Flip readiness to not-ready (K8s stops sending traffic)
      isReady = false;
      app.log.info('Readiness probe set to not-ready');
      
      // 2. Stop accepting new HTTP/WebSocket connections
      await new Promise<void>((resolve) => {
        app.server.close(() => {
          app.log.info('HTTP server closed, no longer accepting connections');
          resolve();
        });
      });
      
      // 3. Stop consumers (drains buffers before stopping)
      if (container.consumer) {
        app.log.info('Stopping consumer and draining buffers...');
        await container.consumer.stop();
        app.log.info('Consumer stopped');
      }
      
      // 4. Stop dispatcher (flushes outbox)
      if (dispatcherRunner) {
        app.log.info('Stopping dispatcher...');
        await dispatcherRunner.stop();
        app.log.info('Dispatcher stopped');
      }
      
      // 5. Close Fastify (closes DB/Redis pools via onClose hooks)
      app.log.info('Closing Fastify and resource pools...');
      await app.close();
      app.log.info('Graceful shutdown complete');
    },
    setReady(ready: boolean) {
      isReady = ready;
    }
  };
};

const registerSecurityHeaders = (app: FastifyInstance) => {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    if (!request.id) {
      Object.defineProperty(request, 'id', {
        value: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        writable: false,
        configurable: true
      });
    }
  });
};

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  let server: MessagingServer | null = null;
  let isShuttingDown = false;
  const SHUTDOWN_TIMEOUT_MS = 45000; // 45s hard timeout

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log(`${signal} received again, forcing immediate exit`);
      process.exit(1);
    }
    isShuttingDown = true;

    console.log(`${signal} received, initiating graceful shutdown (max ${SHUTDOWN_TIMEOUT_MS}ms)...`);

    // Hard timeout to prevent hanging on stuck resources
    const forceExitTimer = setTimeout(() => {
      console.error('Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      if (server) {
        await server.stop();
        clearTimeout(forceExitTimer);
        console.log('Graceful shutdown completed successfully');
        process.exit(0);
      } else {
        clearTimeout(forceExitTimer);
        process.exit(0);
      }
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  };

  // Handle termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle unhandled errors - log and initiate shutdown
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    if (server) {
      server.setReady(false); // Stop accepting new work
    }
    gracefulShutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (server) {
      server.setReady(false); // Stop accepting new work
    }
    gracefulShutdown('uncaughtException');
  });

  createServer()
    .then((s) => {
      server = s;
      return server.start();
    })
    .catch((error) => {
      console.error('Failed to start messaging service', error);
      process.exit(1);
    });
}


