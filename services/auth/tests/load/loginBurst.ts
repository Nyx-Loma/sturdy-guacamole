import { randomBytes } from 'node:crypto';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:8081';
const totalRequests = Number(process.env.LOAD_REQUESTS ?? 500);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 25);

interface Context {
  accountId: string;
  deviceId: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function registerDevice(): Promise<Context> {
  const publicKey = randomBytes(32).toString('base64');
  const res = await fetch(`${baseUrl}/v1/devices/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ public_key: publicKey })
  });
  if (!res.ok) throw new Error(`register failed: ${res.status}`);
  const json = await res.json();
  return { accountId: json.account_id, deviceId: json.device_id };
}

async function performLogin(ctx: Context) {
  const nonceRes = await fetch(`${baseUrl}/v1/auth/nonce`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: ctx.accountId, device_id: ctx.deviceId })
  });
  if (!nonceRes.ok) throw new Error(`nonce failed: ${nonceRes.status}`);
  const { nonce } = await nonceRes.json();

  const loginRes = await fetch(`${baseUrl}/v1/auth/login`, {
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

  if (!loginRes.ok && loginRes.status !== 401) {
    throw new Error(`login failed: ${loginRes.status}`);
  }
}

async function main() {
  console.log(`Login burst against ${baseUrl} - total ${totalRequests}, concurrency ${concurrency}`);
  const ctx = await registerDevice();
  let completed = 0;
  const queue: Promise<void>[] = [];

  const launch = () => {
    if (completed >= totalRequests) return;
    completed += 1;
    const task = performLogin(ctx)
      .catch((error) => {
        console.error('login error', error);
      })
      .finally(() => {
        const idx = queue.indexOf(task);
        if (idx >= 0) queue.splice(idx, 1);
        launch();
      });
    queue.push(task);
  };

  for (let i = 0; i < concurrency; i += 1) {
    launch();
  }

  while (queue.length) {
    await Promise.race(queue);
    await sleep(5);
  }

  console.log('Login burst complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

