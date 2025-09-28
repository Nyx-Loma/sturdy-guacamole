export type DeviceStatus = 'active' | 'revoked';

export interface Device {
  id: string;
  accountId: string;
  publicKey: string;
  displayName?: string;
  status: DeviceStatus;
  createdAt: Date;
  lastSeenAt?: Date;
}


