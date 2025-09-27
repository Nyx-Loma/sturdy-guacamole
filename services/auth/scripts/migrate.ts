import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadConfig } from '../src/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const runMigrations = async () => {
  const config = loadConfig();
  if (config.STORAGE_DRIVER !== 'postgres') {
    console.log('Skipping migrations: STORAGE_DRIVER != postgres');
    return;
  }
  if (!config.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is required to run migrations');
  }

  const pool = new Pool({ connectionString: config.POSTGRES_URL });
  const client = await pool.connect();
  try {
    const migrationsDir = path.resolve(__dirname, '../src/adapters/postgres/migrations');
    const files = ['001_init.sql'];
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      console.log(`Applying migration ${file}`);
      await client.query(sql);
    }
    console.log('Migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
};

const isDirectInvocation = process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1]?.endsWith('scripts/migrate.ts') ||
  process.argv[1]?.endsWith('scripts/migrate.js')
);

if (isDirectInvocation) {
  runMigrations().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
