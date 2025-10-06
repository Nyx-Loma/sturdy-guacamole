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
vi.mock('@fastify/swagger', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@fastify/swagger-ui', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@sanctum/crypto', () => ({
  createCryptoProvider: vi.fn(() => ({
    decrypt: vi.fn(),
    encrypt: vi.fn(),
    generateKey: vi.fn()
  })),
  brandCipherText: vi.fn((value: unknown) => value),
  brandNonce: vi.fn((value: unknown) => value),
  brandSymmetricKey: vi.fn((value: unknown) => value)
}));
vi.mock('@sanctum/crypto/backup/derive', () => ({
  deriveMaterial: vi.fn(async () => ({
    masterKey: new Uint8Array(32),
    clientKey: new Uint8Array(32)
  }))
}));

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

