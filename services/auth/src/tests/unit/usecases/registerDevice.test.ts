import { describe, expect, it, vi } from 'vitest';
import { registerDevice } from '../../../usecases/devices/register';
import { RateLimitError } from '../../../domain/errors';

const baseContainer = () => ({
  repos: {
    devices: {
      countActiveForAccount: vi.fn(async () => 0),
      create: vi.fn(async (input) => ({ ...input, id: 'dev', createdAt: new Date() }))
    }
  },
  config: { limits: { deviceMaxPerAccount: 1 } }
} as any);

describe('registerDevice use case', () => {
  it('creates device when under limit', async () => {
    const container = baseContainer();
    const result = await registerDevice(container, { accountId: 'acc', publicKey: 'pk' });
    expect(container.repos.devices.create).toHaveBeenCalledWith({ accountId: 'acc', publicKey: 'pk', displayName: undefined, status: 'active' });
    expect(result.id).toBe('dev');
  });

  it('throws RateLimitError when limit exceeded', async () => {
    const container = baseContainer();
    container.repos.devices.countActiveForAccount.mockResolvedValue(1);
    await expect(registerDevice(container, { accountId: 'acc', publicKey: 'pk' })).rejects.toBeInstanceOf(RateLimitError);
  });

  it('respects display name and DEVICE_MAX_PER_ACCOUNT override', async () => {
    const container = baseContainer();
    container.config = { DEVICE_MAX_PER_ACCOUNT: 2 };
    const result = await registerDevice(container, { accountId: 'acc', publicKey: 'pk', displayName: 'phone' });
    expect(container.repos.devices.create).toHaveBeenCalledWith({ accountId: 'acc', publicKey: 'pk', displayName: 'phone', status: 'active' });
    expect(result.id).toBe('dev');
  });

  it('throws when device limit config missing', async () => {
    const container = baseContainer();
    container.config = {};
    await expect(registerDevice(container, { accountId: 'acc', publicKey: 'pk' })).rejects.toThrow('device registration requires DEVICE_MAX_PER_ACCOUNT limit');
  });
});
