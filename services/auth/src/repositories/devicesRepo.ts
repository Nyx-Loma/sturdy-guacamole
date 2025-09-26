import type { Device } from '../domain/entities/device';

export interface DevicesRepository {
  create(device: Omit<Device, 'createdAt' | 'lastSeenAt'>): Promise<Device>;
  findById(id: string): Promise<Device | null>;
  findByAccount(accountId: string): Promise<Device[]>;
  update(id: string, patch: Partial<Device>): Promise<void>;
  countActiveForAccount(accountId: string): Promise<number>;
}


