import { describe, expect, it, vi } from 'vitest';
import { createAccountService } from '../../domain/services/accountService';

const mockAccount = { id: 'acc', status: 'active', createdAt: new Date() } as const;

describe('accountService', () => {
  it('creates anonymous account via repo', async () => {
    const repo = { createAnonymous: vi.fn().mockResolvedValue(mockAccount) } as any;
    const service = createAccountService(repo);
    const account = await service.createAnonymous();
    expect(account.id).toBe('acc');
    expect(repo.createAnonymous).toHaveBeenCalled();
  });

  it('gets account by id', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(mockAccount) } as any;
    const service = createAccountService(repo);
    const account = await service.getById('acc');
    expect(account?.id).toBe('acc');
    expect(repo.findById).toHaveBeenCalledWith('acc');
  });
});
