import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerMock = vi.fn();
const listenMock = vi.fn();
const closeMock = vi.fn();
const fastifyInstance = {
  register: registerMock,
  listen: listenMock,
  close: closeMock
};

const fastifyFactoryMock = vi.fn(() => fastifyInstance);

vi.mock('fastify', () => ({ default: fastifyFactoryMock }));

const registerRoutesMock = vi.fn();
vi.mock('../../app/routes', () => ({ registerRoutes: registerRoutesMock }));

describe('createServer', () => {
  const config = {
    HTTP_HOST: '127.0.0.1',
    HTTP_PORT: 8080
  } as any;

const logger = {
  error: vi.fn(),
  info: vi.fn(),
  level: 'info'
} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    registerMock.mockResolvedValue(undefined);
    listenMock.mockResolvedValue(undefined);
    closeMock.mockResolvedValue(undefined);
    registerRoutesMock.mockResolvedValue(undefined);
  });

  it('registers routes and listens successfully', async () => {
    const { createServer } = await import('../../app/server');
    const container = { services: {} } as any;

    const server = await createServer({ config, logger, container });

    expect(fastifyFactoryMock).toHaveBeenCalledWith({ logger: { level: 'info' }, disableRequestLogging: false });
    expect(registerRoutesMock).toHaveBeenCalledWith(fastifyInstance, { config, container });

    await server.listen();
    expect(listenMock).toHaveBeenCalledWith({ host: config.HTTP_HOST, port: config.HTTP_PORT });

    await server.close();
    expect(closeMock).toHaveBeenCalled();
  });

  it('logs and rethrows when listen fails', async () => {
    const { createServer } = await import('../../app/server');
    const boom = new Error('bind failure');
    listenMock.mockRejectedValueOnce(boom);
    const container = { services: {} } as any;

    const server = await createServer({ config, logger, container });

    await expect(server.listen()).rejects.toThrow('bind failure');
    expect(logger.error).toHaveBeenCalledWith({ err: boom }, 'failed to bind auth server');
  });
});

