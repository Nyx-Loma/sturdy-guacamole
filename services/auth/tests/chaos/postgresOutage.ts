import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCallback);
const baseUrl = process.env.BASE_URL ?? 'http://localhost:8081';
const composeFile = process.env.COMPOSE_FILE ?? 'docker-compose.dev.yml';

async function healthCheck() {
  const res = await fetch(`${baseUrl}/health`);
  return res.ok;
}

async function loginSmoke() {
  const res = await fetch(`${baseUrl}/v1/devices/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ public_key: 'smoke' })
  });
  return res.status;
}

async function main() {
  console.log('--- Postgres outage chaos test ---');
  console.log('Baseline health:', await healthCheck());
  console.log('Baseline login status:', await loginSmoke());

  console.log('Stopping Postgres...');
  await exec(`docker compose -f ${composeFile} stop auth-db`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log('Login during outage:', await loginSmoke());

  console.log('Starting Postgres...');
  await exec(`docker compose -f ${composeFile} start auth-db`);
  await new Promise((resolve) => setTimeout(resolve, 8000));
  console.log('Health after recovery:', await healthCheck());
  console.log('Login after recovery:', await loginSmoke());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

