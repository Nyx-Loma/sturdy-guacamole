import { loadConfig } from '../src/config';
import { runMigrations } from '../src/adapters/postgres/migrate';

export const migrate = async () => {
  const config = loadConfig();
  await runMigrations(config);
};

const isDirectInvocation = process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1]?.endsWith('scripts/migrate.ts') ||
  process.argv[1]?.endsWith('scripts/migrate.js')
);

if (isDirectInvocation) {
  migrate().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
