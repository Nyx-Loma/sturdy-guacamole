import type { Account } from '../domain/entities/account';

export interface AccountsRepository {
  createAnonymous(): Promise<Account>;
  findById(id: string): Promise<Account | null>;
  updateStatus(id: string, status: Account['status']): Promise<void>;
}


