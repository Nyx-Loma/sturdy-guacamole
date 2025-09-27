import { describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/bootstrap';
import type { Config } from '@sanctum/config';

const baseConfig: Config = {
  REDIS_QUEUE_URL: 'redis://localhost:6380',
  QUEUE_ENABLED: false,
  QUEUE_STREAM_KEY: 'stream',
  QUEUE_GROUP: 'group',
  QUEUE_CONSUMER_NAME: 'consumer',
  WS_RATE_LIMIT_CONNECTIONS_PER_MIN: 5,
  WS_RATE_LIMIT_MESSAGES_PER_MIN: 10,
  WS_HEARTBEAT_INTERVAL_MS: 1000,
  SERVER_HOST: '127.0.0.1',
  SERVER_PORT: 0
} as const satisfies Config;

describe('apps/server createServer', () => {
  type RouteHandler = (...args: unknown[]) => unknown;
  type HookHandler = (...args: unknown[]) => unknown;

  const makeFastify = () => {
    const routes: Record<string, RouteHandler> = {};
    const hooks: Record<string, HookHandler> = {};
    const fastify = {
      register: vi.fn().mockResolvedValue(undefined),
      get: vi.fn((path: string, opts: unknown, handler?: RouteHandler) => {
        if (typeof opts === 'function') {
          routes[path] = opts as RouteHandler;
        } else {
          routes[path] = handler ?? (() => undefined);
        }
      }),
      addHook: vi.fn((hook: string, handler: HookHandler) => {
        hooks[hook] = handler;
      }),
      listen: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    };
    return { fastify, routes, hooks };
  };

  it('boots without queue and tears down redis on close', async () => {
    const { fastify, routes, hooks } = makeFastify();
    const redis = { quit: vi.fn().mockResolvedValue(undefined) };
    const memoryStore = { load: vi.fn(), persist: vi.fn(), drop: vi.fn() };
    const queue = { close: vi.fn() };

    const hub = {
      getMetricsRegistry: vi.fn().mockReturnValue({ metrics: vi.fn().mockResolvedValue('') })
    };

    const collectDefaultMetrics = vi.fn();

    const server = await createServer(baseConfig, {
      fastifyFactory: () => fastify,
      redisFactory: () => redis,
      createInMemoryResumeStore: () => memoryStore,
      createRedisStreamQueue: vi.fn().mockReturnValue(queue),
      createQueueConsumer: vi.fn(),
      collectDefaultMetrics,
      hubFactory: vi.fn().mockReturnValue(hub),
      RateLimiterMemory: class {
        async consume(): Promise<void> {
          // noop
        }
      }
    });

    expect(collectDefaultMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'arqivo_' })
    );

    const metricsHandler = routes['/metrics'];
    const reply = { header: vi.fn(), send: vi.fn() };
    await metricsHandler({}, reply);
    expect(reply.header).toHaveBeenCalledWith('content-type', 'text/plain');

    await hooks.onClose?.();
    expect(redis.quit).toHaveBeenCalled();
    expect(queue.close).not.toHaveBeenCalled();

    await server.close();
    expect(fastify.close).toHaveBeenCalled();
  });

  it('initializes queue when enabled and closes it on shutdown', async () => {
    const { fastify, routes, hooks } = makeFastify();
    const redis = { quit: vi.fn().mockResolvedValue(undefined) };
    const queueClose = vi.fn().mockResolvedValue(undefined);
    const queue = { close: queueClose };
    const hub = {
      getMetricsRegistry: vi.fn().mockReturnValue({ metrics: vi.fn().mockResolvedValue(''), registerMetric: vi.fn() })
    };
    const createQueueConsumer = vi.fn().mockResolvedValue(undefined);

    await createServer({ ...baseConfig, QUEUE_ENABLED: true }, {
      fastifyFactory: () => fastify,
      redisFactory: () => redis,
      createInMemoryResumeStore: vi.fn(),
      createRedisResumeStore: vi.fn().mockReturnValue({ load: vi.fn(), persist: vi.fn(), drop: vi.fn() }),
      createRedisStreamQueue: vi.fn().mockReturnValue(queue),
      createQueueConsumer,
      hubFactory: vi.fn().mockReturnValue(hub),
      collectDefaultMetrics: vi.fn().mockImplementation(({ register }) => {
        register.registerMetric?.({
          name: 'dummy_metric',
          reset: vi.fn(),
          get: vi.fn()
        });
      }),
      RateLimiterMemory: class {
        async consume(): Promise<void> {
          // noop
        }
      }
    });

    expect(createQueueConsumer).toHaveBeenCalled();

    const wsHandler = routes['/ws'];
    expect(wsHandler).toBeTypeOf('function');

    await hooks.onClose?.();
    expect(queueClose).toHaveBeenCalled();
    expect(redis.quit).toHaveBeenCalled();
  });

  it('handles websocket registration for authorized and unauthorized clients', async () => {
    const { fastify, routes } = makeFastify();
    const redis = { quit: vi.fn().mockResolvedValue(undefined) };
    const memoryStore = { load: vi.fn(), persist: vi.fn(), drop: vi.fn() };
    const register = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ resumeToken: 'token' });
    const hub = {
      register,
      handleMessage: vi.fn(),
      getMetricsRegistry: vi.fn().mockReturnValue({ metrics: vi.fn().mockResolvedValue('') })
    };

    await createServer(baseConfig, {
      fastifyFactory: () => fastify,
      redisFactory: () => redis,
      createInMemoryResumeStore: () => memoryStore,
      createRedisStreamQueue: vi.fn(),
      createQueueConsumer: vi.fn(),
      collectDefaultMetrics: vi.fn(),
      hubFactory: vi.fn().mockReturnValue(hub),
      RateLimiterMemory: class {
        async consume(): Promise<void> {
          // noop
        }
      }
    });

    const wsHandler = routes['/ws'];
    const socket = { send: vi.fn(), on: vi.fn(), close: vi.fn() };
    const unauthorizedConnection = { socket };
    const request = { id: 1, headers: {}, log: fastify.log };

    await wsHandler(unauthorizedConnection, request);
    expect(fastify.log.warn).toHaveBeenCalledWith({ clientId: '1' }, 'websocket unauthorized');

    const authorizedSocket = { send: vi.fn(), on: vi.fn(), close: vi.fn() };
    const authorizedConnection = { socket: authorizedSocket };
    const authRequest = { id: 2, headers: { authorization: 'Bearer token' }, log: fastify.log };

    register.mockResolvedValueOnce({ resumeToken: 'token' });
    await wsHandler(authorizedConnection, authRequest);
    expect(authorizedSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'connection_ack', resumeToken: 'token' }));
  });
});
