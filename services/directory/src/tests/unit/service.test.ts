import { describe, expect, it } from 'vitest';
import { createDirectoryService } from '../../services/directoryService.js';
import { createInMemoryDirectoryRepository } from '../../repositories/inMemoryRepository.js';

const entry = {
  accountId: '11111111-1111-1111-1111-111111111111',
  publicKey: 'pk1',
  deviceCount: 1,
  updatedAt: new Date('2025-01-01T00:00:00Z')
};

describe('directory service', () => {
  it('finds by account id in case-insensitive manner', async () => {
    const service = createDirectoryService(createInMemoryDirectoryRepository([entry]));
    const result = await service.findByAccountId(entry.accountId.toUpperCase());
    expect(result?.accountId).toBe(entry.accountId);
  });

  it('returns null for missing account', async () => {
    const service = createDirectoryService(createInMemoryDirectoryRepository());
    const result = await service.findByAccountId('missing');
    expect(result).toBeNull();
  });
});


