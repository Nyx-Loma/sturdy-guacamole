import { randomBytes } from 'node:crypto';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:8081';
const totalSessions = Number(process.env.REFRESH_SESSIONS ?? 200);
const iterations = Number(process.env.REFRESH_ITERATIONS ?? 20);

interface Session {
  accountId: string;
  deviceId: string;
}

async function register(): Promise<Session> {
  const res = await fetch(`${baseUrl}/v1/devices/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ public_key: randomBytes(32).toString('base64') })
  });
  if (!res.ok) throw new Error(`register failed: ${res.status}`);
  const json = await res.json();
  return { accountId: json.account_id, deviceId: json.device_id };
}

async function loginOnce(session: Session) {
  const nonceRes = await fetch(`${baseUrl}/v1/auth/nonce`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: session.accountId, device_id: session.deviceId })
  });
  if (!nonceRes.ok) throw new Error('nonce failed');
  const { nonce } = await nonceRes.json();
  const loginRes = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      account_id: session.accountId,
      device_id: session.deviceId,
      nonce,
      device_signature: randomBytes(64).toString('base64url'),
      captcha_token: 'load-test'
    })
  });
  if (!loginRes.ok) throw new Error('login failed');
}

async function run() {
  console.log(`Refresh churn: ${totalSessions} sessions x ${iterations} iterations`);
  const sessions: Session[] = [];
  for (let i = 0; i < totalSessions; i += 1) {
    sessions.push(await register());
  }

  for (let iter = 0; iter < iterations; iter += 1) {
    await Promise.all(sessions.map((session) => loginOnce(session)));
    console.log(`iteration ${iter + 1} complete`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

