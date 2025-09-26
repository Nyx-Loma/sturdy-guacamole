export interface RefreshToken {
  id: string;
  accountId: string;
  deviceId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  userAgent?: string;
  ip?: string;
}


