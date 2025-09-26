import { describe, expect, it } from 'vitest';
import { createContainer } from '../../container';
import { loadConfig } from '../../config';

const logger = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any;

describe('refresh tokens repository', () => {
  it('marks refresh token as revoked', async () => {
    const container = await createContainer({ config: loadConfig(), logger });
    const token = await container.repos.tokens.create({
      id: 'refresh-1',
      accountId: 'acc',
      deviceId: 'dev',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1_000_000)
    });

    await container.repos.tokens.revoke(token.id);
    const revoked = await container.repos.tokens.findById(token.id);
    expect(revoked?.revokedAt).toBeDefined();
  });

  it('revokes all refresh tokens for a device', async () => {
    const container = await createContainer({ config: loadConfig(), logger });
    await container.repos.tokens.create({
      id: 'refresh-a',
      accountId: 'acc',
      deviceId: 'device-a',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1_000_000)
    });
    await container.repos.tokens.create({
      id: 'refresh-b',
      accountId: 'acc',
      deviceId: 'device-a',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1_000_000)
    });

    await container.repos.tokens.revokeAllForDevice('device-a');
    const tokens = await Promise.all([
      container.repos.tokens.findById('refresh-a'),
      container.repos.tokens.findById('refresh-b')
    ]);
    tokens.forEach((rt) => expect(rt?.revokedAt).toBeDefined());
  });
});


