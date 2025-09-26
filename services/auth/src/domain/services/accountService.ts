import type { AccountsRepository } from '../../repositories/accountsRepo';
import type { Account } from '../entities/account';

export const createAccountService = (accounts: AccountsRepository) => {
  const createAnonymous = async (): Promise<Account> => {
    return accounts.createAnonymous();
  };

  const getById = async (id: string) => {
    return accounts.findById(id);
  };

  return { createAnonymous, getById };
};


