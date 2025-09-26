export interface PairingToken {
  token: string;
  accountId: string;
  primaryDeviceId: string;
  nonce: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
  usedAt?: Date;
  pendingPublicKey?: string;
  pendingDisplayName?: string;
}


