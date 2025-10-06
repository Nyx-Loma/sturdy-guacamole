import type { FastifyBaseLogger } from 'fastify';
import type { Dispatcher } from './dispatcher';
import type { MessagingConfig } from '../../config';

export interface DispatcherRunner {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export const createDispatcherRunner = (
  dispatcher: Dispatcher,
  config: MessagingConfig,
  logger: FastifyBaseLogger
): DispatcherRunner => {
  let running = false;
  let loopPromise: Promise<void> | null = null;
  const cadenceMs = config.DISPATCH_TICK_MS;

  const runLoop = async () => {
    while (running) {
      try {
        await dispatcher.tick();
      } catch (error) {
        logger.error({ err: error }, 'dispatcher_tick_failed');
      }
      
      // Yield to event loop
      await new Promise((resolve) => setTimeout(resolve, cadenceMs));
    }
  };

  return {
    async start() {
      if (!config.DISPATCHER_ENABLED) {
        logger.info('dispatcher disabled via DISPATCHER_ENABLED=false');
        return;
      }
      if (running) {
        logger.warn('dispatcher already running');
        return;
      }
      running = true;
      loopPromise = runLoop();
      logger.info({ cadenceMs }, 'dispatcher started');
    },

    async stop() {
      if (!running) return;
      running = false;
      if (loopPromise) {
        await loopPromise;
      }
      logger.info('dispatcher stopped');
    },
  };
};

