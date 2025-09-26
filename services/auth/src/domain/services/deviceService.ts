import type { DevicesRepository } from '../../repositories/devicesRepo';
import type { Device } from '../entities/device';
import { RateLimitError, NotFoundError } from '../errors';

export const createDeviceService = (devices: DevicesRepository, maxDevices: number) => {
  const register = async (accountId: string, publicKey: string, displayName?: string) => {
    const count = await devices.countActiveForAccount(accountId);
    if (count >= maxDevices) {
      throw new RateLimitError('device limit reached');
    }
    const device = await devices.create({
      accountId,
      publicKey,
      displayName,
      status: 'active'
    } as Omit<Device, 'id' | 'createdAt' | 'lastSeenAt'>);
    return device;
  };

  const update = async (id: string, patch: Partial<Device>) => {
    const existing = await devices.findById(id);
    if (!existing) throw new NotFoundError('device not found');
    await devices.update(id, patch);
  };

  const revokeAllForAccount = async (accountId: string, exceptDeviceId?: string) => {
    const deviceList = await devices.findByAccount(accountId);
    await Promise.all(
      deviceList.map((device) => {
        if (device.id === exceptDeviceId) {
          return devices.update(device.id, { status: 'active' });
        }
        if (device.status !== 'revoked') {
          return devices.update(device.id, { status: 'revoked' });
        }
        return Promise.resolve();
      })
    );
  };

  return { register, update, revokeAllForAccount };
};


