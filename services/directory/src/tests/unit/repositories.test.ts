import { describe, expect, it } from 'vitest';
import { createInMemoryDirectoryRepository } from '../../repositories/inMemoryRepository.js';
import type { DirectoryEntry } from '../../domain/types.js';

const sample: DirectoryEntry = {
  accountId: '11111111-1111-1111-1111-111111111111',
  displayName: 'Alice',
  publicKey: 'pk1',
  deviceCount: 2,
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  hashedEmail: 'abcd'
};

describe('in-memory directory repository', () => {
  it('returns entry by account id', async () => {
    const repo = createInMemoryDirectoryRepository([sample]);
    const result = await repo.findByAccountId('11111111-1111-1111-1111-111111111111');
    expect(result?.displayName).toBe('Alice');
  });

  it('returns null for missing account', async () => {
    const repo = createInMemoryDirectoryRepository([]);
    const result = await repo.findByAccountId('missing');
    expect(result).toBeNull();
  });

  it('performs case-insensitive hash lookup', async () => {
    const repo = createInMemoryDirectoryRepository([sample]);
    const result = await repo.findByHashedEmail('ABCD');
    expect(result?.accountId).toBe(sample.accountId);
  });
});


