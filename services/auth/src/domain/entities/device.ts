export interface Device {
  id: string;
  accountId: string;
  publicKey: string;
  displayName?: string;
  status: 'active' | 'revoked';
  createdAt: Date;
  lastSeenAt?: Date;
}


