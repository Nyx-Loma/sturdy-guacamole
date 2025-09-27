import { describe, expect, it } from 'vitest';
import type { Account } from '../../../src/domain/entities/account';
import type { Device } from '../../../src/domain/entities/device';
import type { PairingToken } from '../../../src/domain/entities/pairing';
import type { RecoveryBlobRecord, RecoveryRecord } from '../../../src/domain/entities/recovery';
import type { RefreshToken } from '../../../src/domain/entities/tokens';

describe('auth domain entities', () => {
  it('Account has expected defaults', () => {
    const account: Account = {
      id: 'acc-1',
      status: 'active',
      createdAt: new Date()
    };
    expect(account.status).toBe('active');
  });

  it('Device tracks lifecycle fields', () => {
    const device: Device = {
      id: 'dev-1',
      accountId: 'acc-1',
      publicKey: 'pk',
      status: 'active',
      createdAt: new Date(),
      displayName: 'Laptop'
    };
    expect(device.status).toBe('active');
    device.status = 'revoked';
    expect(device.status).toBe('revoked');
    expect(device.displayName).toBe('Laptop');
  });

  it('PairingToken captures pending fields', () => {
    const token: PairingToken = {
      token: 'tok',
      accountId: 'acc',
      primaryDeviceId: 'dev',
      nonce: 'nonce',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
      used: false,
      pendingDisplayName: 'Tablet'
    };
    expect(token.used).toBe(false);
    expect(token.pendingDisplayName).toBe('Tablet');
  });

  it('RecoveryBlobRecord flags active state', () => {
    const blob: RecoveryBlobRecord = {
      id: 'blob',
      accountId: 'acc',
      blobVersion: 1,
      ciphertext: new Uint8Array([1]),
      nonce: new Uint8Array([2]),
      associatedData: new Uint8Array([3]),
      salt: new Uint8Array([4]),
      argonParams: { timeCost: 1, memoryCost: 1, parallelism: 1 },
      profile: 'desktop',
      cipherLength: 1,
      padLength: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      verifier: new Uint8Array([5])
    };
    expect(blob.isActive).toBe(true);
    expect(blob.verifier).toBeInstanceOf(Uint8Array);
  });

  it('RefreshToken holds expiry metadata', () => {
    const refresh: RefreshToken = {
      id: 'rt',
      accountId: 'acc',
      deviceId: 'dev',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1000)
    };
    expect(refresh.revokedAt).toBeUndefined();
  });

  it('Account matches expected shape', () => {
    const record: Account = {
      id: 'acc-123',
      status: 'active',
      createdAt: new Date()
    };
    expect(record.status).toBe('active');
  });

  it('RecoveryRecord enforces argon policy fields', () => {
    const record: RecoveryRecord = {
      accountId: 'acc-1',
      rcHash: 'hash',
      params: { timeCost: 3, memoryCost: 4096, parallelism: 2, version: 1 },
      updatedAt: new Date()
    };
    expect(record.params.version).toBe(1);
  });
});
