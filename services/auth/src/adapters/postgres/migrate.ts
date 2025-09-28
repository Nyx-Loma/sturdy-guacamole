import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import type { Config } from '../../config';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const migrationsDir = path.resolve(path.dirname(__filename), './migrations');

export const runMigrations = async (config: Config) => {
  if (config.STORAGE_DRIVER !== 'postgres') {
    return;
  }
  if (!config.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is required to run migrations');
  }

  const pool = new Pool({ connectionString: config.POSTGRES_URL });
  const client = await pool.connect();
  try {
    const files = ['001_init.sql'];
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
    }
  } finally {
    client.release();
    await pool.end();
  }
};


