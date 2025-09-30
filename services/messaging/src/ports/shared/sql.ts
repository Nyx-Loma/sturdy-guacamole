export type QueryResult<T = unknown> = {
  rows: T[];
};

export type SqlClient = {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

export const inTransaction = async <T>(
  sql: SqlClient,
  run: (client: SqlClient) => Promise<T>
): Promise<T> => {
  await sql.query('BEGIN');
  try {
    const result = await run(sql);
    await sql.query('COMMIT');
    return result;
  } catch (error) {
    await sql.query('ROLLBACK');
    throw error;
  }
};

