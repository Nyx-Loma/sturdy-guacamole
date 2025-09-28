import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../../app/server.js';
import { resetConfigForTests } from '../../config/index.js';

const sample = {
  accountId: '123e4567-e89b-12d3-a456-426614174000',
  displayName: 'Alice',
  publicKey: 'pk1',
  deviceCount: 2,
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  hashedEmail: 'a'.repeat(64)
};

describe('directory routes', () => {
  const server = createServer();

  beforeAll(async () => {
    await server.app.ready();
  });

  beforeEach(() => {
    resetConfigForTests();
    delete process.env.HASHED_EMAIL_LOOKUP_ENABLED;
    delete process.env.HASHED_EMAIL_SALT;
    server.app.directoryService = {
      async findByAccountId(id: string) {
        return id === sample.accountId ? sample : null;
      },
      async findByHashedEmail() {
        return null;
      }
    };
  });

  afterAll(async () => {
    await server.stop();
  });

  it('returns account by id', async () => {
    const response = await server.app.inject({ method: 'GET', url: `/v1/directory/accounts/${sample.accountId}` });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.account_id).toBe(sample.accountId);
  });

  it('returns 404 for missing account', async () => {
    const response = await server.app.inject({ method: 'GET', url: '/v1/directory/accounts/00000000-0000-0000-0000-000000000000' });
    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for hashed email lookup when disabled', async () => {
    const response = await server.app.inject({ method: 'GET', url: `/v1/directory/accounts?email=${'a'.repeat(64)}` });
    expect(response.statusCode).toBe(404);
  });

  it('returns entry for hashed email lookup when enabled', async () => {
    process.env.HASHED_EMAIL_LOOKUP_ENABLED = 'true';
    process.env.HASHED_EMAIL_SALT = '';
    resetConfigForTests();
    const hashed = sample.hashedEmail!;
    server.app.directoryService = {
      async findByAccountId() {
        return null;
      },
      async findByHashedEmail(value: string) {
        return value === hashed ? sample : null;
      }
    };

    const response = await server.app.inject({ method: 'GET', url: `/v1/directory/accounts?email=${hashed}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().account_id).toBe(sample.accountId);
  });

  it('hashes email when lookup enabled with salt', async () => {
    process.env.HASHED_EMAIL_LOOKUP_ENABLED = 'true';
    process.env.HASHED_EMAIL_SALT = 'pepper';
    resetConfigForTests();

    const response = await server.app.inject({ method: 'POST', url: '/v1/directory/accounts/hash', payload: { email: 'test@example.com' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().hashed_email).toMatch(/^[0-9a-f]{64}$/);
  });
});


