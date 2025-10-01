import { beforeAll, beforeEach, afterAll } from 'vitest';
import { Client } from 'pg';
import { checkDatabaseHealth, checkDatabaseSchema } from './dbHealthCheck';

export interface DatabaseTestContext {
  client: Client;
  available: boolean;
}

/**
 * Sets up database connection for integration tests with automatic health checking.
 * Skips tests gracefully if database is unavailable.
 * 
 * @param connectionString - PostgreSQL connection string
 * @param options - Configuration options
 * @returns Database test context
 */
export const setupDatabaseTests = (
  connectionString: string,
  options: {
    truncateTables?: string[];
    requireSchema?: boolean;
  } = {}
): DatabaseTestContext => {
  const { truncateTables = [], requireSchema = true } = options;
  const client = new Client({ connectionString });
  let available = false;

  beforeAll(async () => {
    // Check if database is available
    const health = await checkDatabaseHealth(connectionString);
    
    if (!health.available) {
      console.warn(`⚠️  Database not available: ${health.error}`);
      console.warn('💡 Integration tests will be skipped. To run them:');
      console.warn('   1. Start database: docker-compose -f docker-compose.dev.yml up -d messaging-db');
      console.warn('   2. Initialize schema: pnpm db:setup:messaging');
      return; // Tests will skip via the check in each test
    }

    // Check if schema is initialized
    if (requireSchema) {
      const schemaReady = await checkDatabaseSchema(connectionString);
      
      if (!schemaReady) {
        console.warn('⚠️  Database schema not initialized');
        console.warn('💡 Run: pnpm db:setup:messaging');
        return;
      }
    }

    // Connect to database
    await client.connect();
    available = true;
  });

  beforeEach(async () => {
    if (!available) return;

    // Truncate tables in reverse dependency order to avoid FK violations
    for (const table of truncateTables.reverse()) {
      await client.query(`TRUNCATE ${table} CASCADE`);
    }
  });

  afterAll(async () => {
    if (available) {
      await client.end();
    }
  });

  return { client, available };
};

