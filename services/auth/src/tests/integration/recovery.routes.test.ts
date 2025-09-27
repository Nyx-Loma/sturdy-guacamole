import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from '../../app/routes';
import { createLogger } from '../../logging';
import { createContainer } from '../../container';
import { loadConfig, resetConfigForTests } from '../../config';
import { RecoveryPolicyError, RecoveryValidationError } from '../../domain/errors';

const buildServer = async (override?: (container: Awaited<ReturnType<typeof createContainer>>) => void) => {
  resetConfigForTests();
  process.env.STORAGE_DRIVER = 'memory';
  process.env.CAPTCHA_PROVIDER = 'none';
  const config = loadConfig();
  const logger = createLogger({ level: 'error' });
  const container = await createContainer({ config, logger });
  override?.(container);
  const app = Fastify({ logger: false });
  await registerRoutes(app, { config, container });
  return { app, container };
};

describe('recovery routes', () => {
  it('returns dummy payload when no account provided', async () => {
    const { app } = await buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/recovery/backup/prepare',
      payload: {}
    });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.metadata.is_dummy).toBe(true);
    await app.close();
  });

  it('validates submit payload', async () => {
    const { app } = await buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/recovery/backup/submit',
      payload: {}
    });
    expect(response.statusCode).toBeLessThan(500);
    await app.close();
  });

  it('returns status payload for unknown account', async () => {
    const { app } = await buildServer();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/recovery/backup/status',
      query: { account_id: '00000000-0000-4000-8000-000000000000' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hasBackup: false });
    await app.close();
  });

  it('handles restore validation errors', async () => {
    const { app } = await buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/recovery/backup/restore',
      payload: { account_id: '00000000-0000-4000-8000-000000000000', mrc: 'invalid' }
    });
    expect(response.statusCode).toBeLessThan(500);
    await app.close();
  });

  it('returns 422 when backup submit violates policy', async () => {
    const { app } = await buildServer((container) => {
      container.services.recoveryBackup.createBackup = async () => {
        throw new RecoveryPolicyError('policy');
      };
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/recovery/backup/submit',
      payload: {
        account_id: '00000000-0000-4000-8000-000000000000',
        blob_version: 1,
        ciphertext: 'YQ',
        nonce: 'YQ',
        associated_data: 'YQ',
        salt: 'YQ',
        argon: { time_cost: 1, memory_cost: 1, parallelism: 1, profile: 'desktop' },
        cipher_length: 1,
        pad_length: 0
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: 'RECOVERY_POLICY' });
    await app.close();
  });

  it('returns 400 when restore fails validation', async () => {
    const { app } = await buildServer((container) => {
      container.services.recovery.restore = async () => {
        throw new RecoveryValidationError('invalid');
      };
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/recovery/backup/restore',
      payload: {
        account_id: '00000000-0000-4000-8000-000000000000',
        mrc: 'valid-code'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'RECOVERY_VALIDATION' });
    await app.close();
  });

  it('returns 503 when prepare fails unexpectedly', async () => {
    const { app } = await buildServer((container) => {
      container.services.recoveryBackup.prepare = async () => {
        throw new Error('db down');
      };
    });

    const response = await app.inject({ method: 'POST', url: '/v1/recovery/backup/prepare', payload: {} });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'BACKUP_PREPARE_FAILED' });
    await app.close();
  });

  it('returns 503 when status lookup fails unexpectedly', async () => {
    const { app } = await buildServer((container) => {
      container.services.recoveryBackup.getStatus = async () => {
        throw new Error('status fail');
      };
    });

    const response = await app.inject({ method: 'GET', url: '/v1/recovery/backup/status', query: { account_id: '00000000-0000-4000-8000-000000000000' } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'STATUS_UNAVAILABLE' });
    await app.close();
  });

  it('returns 503 when restore fails unexpectedly', async () => {
    const { app } = await buildServer((container) => {
      container.services.recovery.restore = async () => {
        throw new Error('restore down');
      };
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/recovery/backup/restore',
      payload: {
        account_id: '00000000-0000-4000-8000-000000000000',
        mrc: 'valid-code'
      }
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'RESTORE_FAILED' });
    await app.close();
  });

  it('allows captcha success when turnstile returns allow', async () => {
    const { app, container } = await buildServer();
    if (container.services.turnstile) {
      container.services.turnstile.verify = async () => ({ provider: 'turnstile', verdict: 'allow' });
    }
    const response = await app.inject({
      method: 'POST',
      url: '/v1/recovery/backup/prepare',
      payload: {}
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
