import { randomUUID } from 'node:crypto';
import type { Device } from '../../domain/entities/device';
import type { DevicesRepository } from '../../repositories/devicesRepo';

export const createInMemoryDevicesRepository = (): DevicesRepository => {
  const devices = new Map<string, Device>();
  return {
    async create(device) {
      const record: Device = {
        ...device,
        id: randomUUID(),
        status: 'active',
        createdAt: new Date()
      };
      devices.set(record.id, record);
      return record;
    },
    async findById(id) {
      return devices.get(id) ?? null;
    },
    async findByAccount(accountId) {
      return [...devices.values()].filter((d) => d.accountId === accountId);
    },
    async update(id, patch) {
      const current = devices.get(id);
      if (current) {
        devices.set(id, { ...current, ...patch });
      }
    },
    async countActiveForAccount(accountId) {
      return [...devices.values()].filter((d) => d.accountId === accountId && d.status === 'active').length;
    }
  };
};


