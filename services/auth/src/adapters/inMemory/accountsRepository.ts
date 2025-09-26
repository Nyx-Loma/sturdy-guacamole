import { randomUUID } from 'node:crypto';
import type { Account } from '../../domain/entities/account';
import type { AccountsRepository } from '../../repositories/accountsRepo';

export const createInMemoryAccountsRepository = (): AccountsRepository => {
  const accounts = new Map<string, Account>();
  return {
    async createAnonymous() {
      const account: Account = {
        id: randomUUID(),
        status: 'active',
        createdAt: new Date()
      };
      accounts.set(account.id, account);
      return account;
    },
    async findById(id) {
      return accounts.get(id) ?? null;
    },
    async updateStatus(id, status) {
      const existing = accounts.get(id);
      if (existing) {
        accounts.set(id, { ...existing, status });
      }
    }
  };
};


