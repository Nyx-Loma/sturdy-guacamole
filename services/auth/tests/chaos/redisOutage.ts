import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCallback);
const baseUrl = process.env.BASE_URL ?? 'http://localhost:8081';
const composeFile = process.env.COMPOSE_FILE ?? 'docker-compose.dev.yml';

async function pairingSmoke() {
  const res = await fetch(`${baseUrl}/v1/devices/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ public_key: 'smoke' })
  });
  if (!res.ok) return res.status;
  const json = await res.json();
  const initRes = await fetch(`${baseUrl}/v1/devices/pair/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: json.account_id, primary_device_id: json.device_id, captcha_token: 'chaos' })
  });
  return initRes.status;
}

async function main() {
  console.log('--- Redis outage chaos test ---');
  console.log('Baseline pairing status:', await pairingSmoke());

  console.log('Stopping Redis...');
  await exec(`docker compose -f ${composeFile} stop auth-cache`);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  console.log('Pairing during outage:', await pairingSmoke());

  console.log('Starting Redis...');
  await exec(`docker compose -f ${composeFile} start auth-cache`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log('Pairing after recovery:', await pairingSmoke());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

