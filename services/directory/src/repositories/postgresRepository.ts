import { Pool } from 'pg';
import type { DirectoryEntry, DirectoryRepository } from '../domain/types';
import { loadConfig } from '../config';

export interface PostgresDirectoryRepositoryOptions {
  connectionString?: string;
}

interface DirectoryRow {
  account_id: string;
  display_name: string | null;
  public_key: string;
  device_count: number;
  updated_at: string | Date;
  hashed_email: string | null;
}

export const createPostgresDirectoryRepository = (options: PostgresDirectoryRepositoryOptions = {}): DirectoryRepository => {
  const cfg = loadConfig();
  const connectionString = options.connectionString ?? cfg.POSTGRES_URL;
  if (!connectionString) throw new Error('POSTGRES_URL is required for postgres storage');

  const pool = new Pool({ connectionString });

  const mapRow = (row: DirectoryRow): DirectoryEntry => ({
    accountId: row.account_id,
    displayName: row.display_name ?? undefined,
    publicKey: row.public_key,
    deviceCount: Number(row.device_count),
    updatedAt: new Date(row.updated_at),
    hashedEmail: row.hashed_email ?? undefined
  });

  return {
    async findByAccountId(accountId: string): Promise<DirectoryEntry | null> {
      const { rows } = await pool.query<DirectoryRow>(
        'select account_id, display_name, public_key, device_count, updated_at, hashed_email from directory.entries where account_id = $1',
        [accountId.toLowerCase()]
      );
      return rows[0] ? mapRow(rows[0]) : null;
    },
    async findByHashedEmail(hashedEmail: string): Promise<DirectoryEntry | null> {
      const { rows } = await pool.query<DirectoryRow>(
        'select account_id, display_name, public_key, device_count, updated_at, hashed_email from directory.entries where hashed_email = $1',
        [hashedEmail.toLowerCase()]
      );
      return rows[0] ? mapRow(rows[0]) : null;
    }
  };
};

export const SQL_MIGRATIONS = `
create schema if not exists directory;
create table if not exists directory.entries (
  account_id uuid primary key,
  display_name text,
  public_key text not null,
  device_count integer not null default 0,
  updated_at timestamptz not null default now(),
  hashed_email text unique
);
create index if not exists idx_directory_entries_hashed_email on directory.entries (hashed_email);
`;

export const runMigrations = async (connectionString?: string) => {
  const cfg = loadConfig();
  const cs = connectionString ?? cfg.POSTGRES_URL;
  if (!cs) throw new Error('POSTGRES_URL is required for migrations');
  const pool = new Pool({ connectionString: cs });
  try {
    await pool.query(SQL_MIGRATIONS);
  } finally {
    await pool.end();
  }
};


