import { Pool } from 'pg';
import type { Config } from '../../config';

let pool: Pool | undefined;

export const getPool = (config: Config) => {
  if (config.STORAGE_DRIVER !== 'postgres') {
    throw new Error('postgres pool requested but STORAGE_DRIVER is not postgres');
  }

  if (!config.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is required when STORAGE_DRIVER=postgres');
  }

  if (!pool) {
    pool = new Pool({ connectionString: config.POSTGRES_URL });
  }

  return pool;
};

export const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
};

