import { describe, expect, it, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { createContainer } from '../../container';
import { registerRoutes } from '../../app/routes';
import { createLogger } from '../../logging';
import { loadConfig, resetConfigForTests } from '../../config';

const buildServer = async (setup?: (container: Awaited<ReturnType<typeof createContainer>>) => void) => {
  resetConfigForTests();
  process.env.STORAGE_DRIVER = 'memory';
  process.env.CAPTCHA_PROVIDER = 'none';
  const config = loadConfig();
  const logger = createLogger({ level: 'error' });
  const container = await createContainer({ config, logger });
  setup?.(container);
  const app = Fastify({ logger: false });
  await registerRoutes(app, { config, container });
  return { app, container };
};

describe('devices routes', () => {
  beforeEach(() => {
    resetConfigForTests();
  });

  it('creates device without account id by provisioning anonymous account', async () => {
    const { app } = await buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload: {
        public_key: 'abc'
      }
    });
    expect(response.statusCode).toBe(201);
    const json = response.json();
    expect(json.device_id).toBeDefined();
    expect(json.account_id).toBeDefined();
    await app.close();
  });

  it('returns validation errors for invalid payload', async () => {
    const { app } = await buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload: { public_key: 123 }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 429 when RateLimitError thrown', async () => {
    const { app } = await buildServer((container) => {
      container.services.devices.register = async () => {
        throw new (await import('../../domain/errors')).RateLimitError('limit');
      };
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload: {
        account_id: '11111111-1111-4111-8111-111111111111',
        public_key: 'pk'
      }
    });
    expect(response.statusCode).toBe(429);
    await app.close();
  });

  it('returns 503 when registration fails unexpectedly', async () => {
    const { app } = await buildServer((container) => {
      container.services.devices.register = async () => {
        throw new Error('boom');
      };
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload: {
        account_id: '11111111-1111-4111-8111-111111111111',
        public_key: 'pk'
      }
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it('returns 503 when device limit configuration missing', async () => {
    const { app } = await buildServer((container) => {
      container.services.devices.register = async () => {
        throw new Error('device registration requires DEVICE_MAX_PER_ACCOUNT limit');
      };
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload: {
        account_id: '22222222-2222-4222-8222-222222222222',
        public_key: 'pk'
      }
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'DEVICE_REGISTRATION_FAILED' });
    await app.close();
  });

  it('returns 429 when account exceeds device limit', async () => {
    const { app } = await buildServer((container) => {
      container.services.devices.register = async () => {
        throw new (await import('../../domain/errors')).RateLimitError('device limit reached');
      };
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload: {
        account_id: '33333333-3333-4333-8333-333333333333',
        public_key: 'new'
      }
    });
    expect(response.statusCode).toBe(429);
    await app.close();
  });
});


