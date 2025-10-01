import { Client } from 'pg';

export interface DbHealthCheckResult {
  available: boolean;
  error?: string;
}

/**
 * Checks if the database is available and responsive.
 * Used to gracefully skip integration tests when DB is not running.
 */
export const checkDatabaseHealth = async (connectionString: string): Promise<DbHealthCheckResult> => {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return { available: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { 
      available: false, 
      error: errorMessage 
    };
  }
};

/**
 * Ensures the database schema is initialized.
 * Returns true if schema exists, false otherwise.
 */
export const checkDatabaseSchema = async (connectionString: string): Promise<boolean> => {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Check if messaging schema exists
    const schemaResult = await client.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'messaging')`
    );
    
    const schemaExists = schemaResult.rows[0]?.exists ?? false;
    
    if (schemaExists) {
      // Check if key tables exist
      const tablesResult = await client.query(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = 'messaging' 
         AND table_name IN ('messages', 'conversations', 'conversation_participants')`
      );
      
      const tableCount = parseInt(tablesResult.rows[0]?.count ?? '0', 10);
      await client.end();
      
      return tableCount === 3;
    }
    
    await client.end();
    return false;
  } catch {
    // Schema check failed - database might be unavailable or schema not initialized
    try {
      await client.end();
    } catch {
      // Ignore cleanup errors
    }
    return false;
  }
};

