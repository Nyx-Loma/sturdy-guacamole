import { describe, expect, it, vi } from 'vitest';
import { createAnonymousAccount } from '../../../usecases/accounts/createAnonymous';

const makeContainer = () => {
  const createAnonymous = vi.fn(async () => ({ id: 'acc', status: 'active', createdAt: new Date() }));
  return {
    repos: { accounts: { createAnonymous } }
  } as any;
};

describe('createAnonymousAccount use case', () => {
  it('delegates to accounts repository', async () => {
    const container = makeContainer();
    const account = await createAnonymousAccount(container);
    expect(container.repos.accounts.createAnonymous).toHaveBeenCalled();
    expect(account.id).toBe('acc');
  });

  it('propagates repository errors', async () => {
    const container = {
      repos: { accounts: { createAnonymous: vi.fn(async () => { throw new Error('db down'); }) } }
    } as any;
    await expect(createAnonymousAccount(container)).rejects.toThrow('db down');
  });
});
