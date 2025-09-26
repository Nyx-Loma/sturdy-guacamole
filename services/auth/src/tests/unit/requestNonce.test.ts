import { describe, expect, it, vi } from 'vitest';
import { requestDeviceNonce } from '../../usecases/auth/requestNonce';
import { NotFoundError } from '../../domain/errors';
import { createDeviceAssertionService } from '../../domain/services/deviceAssertion';
import { createMemoryNonceStore } from '../../adapters/memoryNonceStore';

const makeContainer = () => {
  const devices = new Map<string, { id: string; accountId: string }>();
  const nonceStore = createMemoryNonceStore();
  const assertion = createDeviceAssertionService(nonceStore, 50);
  return {
    repos: {
      devices: {
        async findById(id: string) {
          return devices.get(id) ?? null;
        }
      }
    },
    services: {
      deviceAssertion: assertion
    },
    devices,
    nonceStore
  } as any;
};

describe('requestDeviceNonce use case', () => {
  it('returns nonce for known device', async () => {
    const container = makeContainer();
    container.devices.set('device-1', { id: 'device-1', accountId: 'acc-1' });

    const result = await requestDeviceNonce(container, { accountId: 'acc-1', deviceId: 'device-1' });
    expect(result.nonce).toBeDefined();
  });

  it('throws when device not found', async () => {
    const container = makeContainer();

    await expect(
      requestDeviceNonce(container, { accountId: 'acc-1', deviceId: 'missing' })
    ).rejects.toThrow(NotFoundError);
  });

  it('throws when device belongs to different account', async () => {
    const container = makeContainer();
    container.devices.set('device-1', { id: 'device-1', accountId: 'acc-2' });

    await expect(
      requestDeviceNonce(container, { accountId: 'acc-1', deviceId: 'device-1' })
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects stale nonce usage after TTL', async () => {
    const container = makeContainer();
    container.devices.set('device-1', { id: 'device-1', accountId: 'acc-1' });
    const { nonce } = await requestDeviceNonce(container, { accountId: 'acc-1', deviceId: 'device-1' });
    vi.useFakeTimers();
    vi.advanceTimersByTime(100);
    const ok = await container.services.deviceAssertion.verify(new Uint8Array(), nonce, new Uint8Array(), 'device-1');
    expect(ok).toBe(false);
    vi.useRealTimers();
  });
});
