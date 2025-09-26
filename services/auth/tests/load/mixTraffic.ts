import { randomBytes } from 'node:crypto';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8081';
const durationMs = Number(process.env.LOAD_DURATION_MS ?? 60000);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 50);

interface Context {
  accountId: string;
  deviceId: string;
}

async function register(): Promise<Context> {
  const res = await fetch(`${baseUrl}/v1/devices/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ public_key: randomBytes(32).toString('base64') })
  });
  if (!res.ok) throw new Error(`register failed: ${res.status}`);
  const json = await res.json();
  return { accountId: json.account_id, deviceId: json.device_id };
}

async function login(ctx: Context) {
  const nonceRes = await fetch(`${baseUrl}/v1/auth/nonce`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: ctx.accountId, device_id: ctx.deviceId })
  });
  if (!nonceRes.ok) return;
  const { nonce } = await nonceRes.json();
  await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      account_id: ctx.accountId,
      device_id: ctx.deviceId,
      nonce,
      device_signature: randomBytes(64).toString('base64url'),
      captcha_token: 'load-test'
    })
  });
}

async function pairing(ctx: Context) {
  const initRes = await fetch(`${baseUrl}/v1/devices/pair/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: ctx.accountId, primary_device_id: ctx.deviceId, captcha_token: 'load-test' })
  });
  if (!initRes.ok) return;
  const init = await initRes.json();
  const token = init.pairing_token;

  await fetch(`${baseUrl}/v1/devices/pair/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pairing_token: token, new_device_pubkey: randomBytes(32).toString('base64') })
  });

  await fetch(`${baseUrl}/v1/devices/pair/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pairing_token: token })
  });
}

async function health() {
  await fetch(`${baseUrl}/health`);
}

async function main() {
  console.log(`Mix traffic for ${durationMs}ms at concurrency ${concurrency}`);
  const contexts: Context[] = [];
  for (let i = 0; i < concurrency; i += 1) {
    contexts.push(await register());
  }

  const start = Date.now();
  while (Date.now() - start < durationMs) {
    await Promise.all(
      contexts.map(async (ctx, idx) => {
        const roll = Math.random();
        if (roll < 0.7) {
          await login(ctx);
        } else if (roll < 0.9) {
          await pairing(ctx);
        } else {
          await health();
        }
      })
    );
  }

  console.log('Mix traffic complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

