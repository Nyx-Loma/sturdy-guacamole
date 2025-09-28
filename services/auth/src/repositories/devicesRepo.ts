import type { Device } from '../domain/entities/device';

export type CreateDeviceInput = Omit<Device, 'id' | 'createdAt' | 'lastSeenAt'>;

export interface DevicesRepository {
  create(device: CreateDeviceInput): Promise<Device>;
  findById(id: string): Promise<Device | null>;
  findByAccount(accountId: string): Promise<Device[]>;
  update(id: string, patch: Partial<Device>): Promise<void>;
  countActiveForAccount(accountId: string): Promise<number>;
}


