import { DirectoryEntry } from '../domain/types';

export interface DirectoryRepository {
  findByAccountId(accountId: string): Promise<DirectoryEntry | null>;
  findByHashedEmail(hashedEmail: string): Promise<DirectoryEntry | null>;
}

const normalizeHash = (hash: string) => hash.toLowerCase();

export const createInMemoryDirectoryRepository = (seed: DirectoryEntry[] = []): DirectoryRepository => {
  const byAccount = new Map<string, DirectoryEntry>();
  const byHash = new Map<string, DirectoryEntry>();

  const insert = (entry: DirectoryEntry) => {
    byAccount.set(entry.accountId, entry);
    if (entry.hashedEmail) {
      byHash.set(normalizeHash(entry.hashedEmail), entry);
    }
  };

  seed.forEach(insert);

  return {
    async findByAccountId(accountId: string) {
      return byAccount.get(accountId) ?? null;
    },
    async findByHashedEmail(hashedEmail: string) {
      return byHash.get(normalizeHash(hashedEmail)) ?? null;
    }
  };
};


