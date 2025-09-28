export interface DirectoryEntry {
  accountId: string;
  displayName?: string;
  publicKey: string;
  deviceCount: number;
  updatedAt: Date;
  hashedEmail?: string;
}

export interface DirectoryRepository {
  findByAccountId(accountId: string): Promise<DirectoryEntry | null>;
  findByHashedEmail(hashedEmail: string): Promise<DirectoryEntry | null>;
}

export interface PostgresClientLike {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

