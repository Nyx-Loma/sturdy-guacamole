import { describe, expect, it } from 'vitest';
import { createInMemoryRecoveryRepository } from '../../../../adapters/inMemory/recoveryRepository';

describe('inMemoryRecoveryRepository', () => {
  it('deactivates active blobs for account', async () => {
    const repo = createInMemoryRecoveryRepository();
    await repo.createBlob({
      id: 'b',
      accountId: 'acc',
      blobVersion: 1,
      ciphertext: Buffer.alloc(0),
      nonce: Buffer.alloc(0),
      associatedData: Buffer.alloc(0),
      salt: Buffer.alloc(0),
      argonParams: { timeCost: 1, memoryCost: 1, parallelism: 1 },
      profile: 'desktop',
      cipherLength: 0,
      padLength: 0,
      verifier: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      previousBlobId: null
    } as any);
    await repo.deactivateBlobs('acc');
    const active = await repo.getActiveBlob('acc');
    expect(active).toBeNull();
  });

  it('delete removes blobs for account', async () => {
    const repo = createInMemoryRecoveryRepository();
    await repo.createBlob({
      id: 'b',
      accountId: 'acc',
      blobVersion: 1,
      ciphertext: Buffer.alloc(0),
      nonce: Buffer.alloc(0),
      associatedData: Buffer.alloc(0),
      salt: Buffer.alloc(0),
      argonParams: { timeCost: 1, memoryCost: 1, parallelism: 1 },
      profile: 'desktop',
      cipherLength: 0,
      padLength: 0,
      verifier: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      previousBlobId: null
    } as any);
    await repo.delete('acc');
    expect(await repo.listBlobs('acc')).toHaveLength(0);
  });
});

