import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap } from '../../app/bootstrap';
import { getPublicKey, sign, utils as edUtils, hashes } from '@noble/ed25519';
import { createHash, randomBytes } from 'node:crypto';
import { resetConfigForTests } from '../../config';

const hash512 = (message: Uint8Array) => {
  const digest = createHash('sha512').update(Buffer.from(message)).digest();
  return new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength);
};

beforeAll(() => {
  hashes.sha512 = hash512;
  edUtils.sha512Sync ??= hash512;
  edUtils.sha512 ??= async (message: Uint8Array) => hash512(message);
});

beforeEach(() => {
  resetConfigForTests();
  process.env.STORAGE_DRIVER = 'memory';
  process.env.CAPTCHA_PROVIDER = 'none';
  delete process.env.POSTGRES_URL;
});

const setupAccountAndDevice = async (container: any, privateKey: Uint8Array) => {
  const account = await container.repos.accounts.createAnonymous();
  const publicKey = Buffer.from(await getPublicKey(privateKey)).toString('base64');
  const device = await container.repos.devices.create({
    accountId: account.id,
    publicKey,
    status: 'active'
  } as any);
  return { account, device };
};

describe('auth login', () => {
  it('issues tokens when captcha allows login', async () => {
    const captchaMock = { verify: async () => true };
    const { server, container } = await bootstrap({ services: { captcha: captchaMock } });
    const privateKey = Uint8Array.from(randomBytes(32));
    const { account, device } = await setupAccountAndDevice(container, privateKey);

    const nonceRes = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/nonce',
      payload: { account_id: account.id, device_id: device.id }
    });
    expect(nonceRes.statusCode).toBe(200);
    const nonce = nonceRes.json().nonce;
    expect(nonce).toBeDefined();
    const signature = await sign(Buffer.from(nonce), privateKey);

    const loginRes = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        account_id: account.id,
        device_id: device.id,
        nonce,
        device_signature: Buffer.from(signature).toString('base64url'),
        captcha_token: 'token-ok'
      }
    });

    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json();
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    await server.close();
  });

  it('rejects login when captcha fails', async () => {
    const captchaMock = { verify: async () => false };
    const { server, container } = await bootstrap({ services: { captcha: captchaMock } });
    const privateKey = Uint8Array.from(randomBytes(32));
    const { account, device } = await setupAccountAndDevice(container, privateKey);

    const nonceRes = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/nonce',
      payload: { account_id: account.id, device_id: device.id }
    });
    expect(nonceRes.statusCode).toBe(200);
    const nonce = nonceRes.json().nonce;
    expect(nonce).toBeDefined();
    const signature = await sign(Buffer.from(nonce), privateKey);

    const loginRes = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        account_id: account.id,
        device_id: device.id,
        nonce,
        device_signature: Buffer.from(signature).toString('base64url'),
        captcha_token: 'token-bad'
      }
    });

    expect(loginRes.statusCode).toBe(429);
    expect(loginRes.json()).toMatchObject({ error: 'CAPTCHA_REQUIRED' });
    await server.close();
  });
});


