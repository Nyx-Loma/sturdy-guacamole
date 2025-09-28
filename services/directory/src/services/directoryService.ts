import { DirectoryEntry } from '../domain/types';
import type { DirectoryRepository } from '../repositories/inMemoryRepository';

const normalizeAccountId = (value: string) => value.trim().toLowerCase();

const normalizeHashedEmail = (value: string) => value.trim().toLowerCase();

export interface DirectoryService {
  findByAccountId(accountId: string): Promise<DirectoryEntry | null>;
  findByHashedEmail(hashedEmail: string): Promise<DirectoryEntry | null>;
}

export const createDirectoryService = (repo: DirectoryRepository): DirectoryService => ({
  async findByAccountId(accountId) {
    if (!accountId) return null;
    return repo.findByAccountId(normalizeAccountId(accountId));
  },
  async findByHashedEmail(hashedEmail) {
    if (!hashedEmail) return null;
    return repo.findByHashedEmail(normalizeHashedEmail(hashedEmail));
  }
});


