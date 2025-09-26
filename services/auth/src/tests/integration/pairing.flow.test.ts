import { describe, expect, it } from 'vitest';
import { bootstrap } from '../../app/bootstrap';

const setupAccount = async (container: any) => {
  const account = await container.repos.accounts.createAnonymous();
  const primary = await container.repos.devices.create({
    accountId: account.id,
    publicKey: 'primary',
    status: 'active'
  } as any);
  return { account, primary };
};

describe('pairing flow', () => {
  it('runs init -> complete -> approve when captcha allows', async () => {
    const boot = await bootstrap({ services: { captcha: { verify: async () => true } } });
    const { server, container } = boot;
    const { account, primary } = await setupAccount(container);

    const initRes = await server.app.inject({
      method: 'POST',
      url: '/v1/devices/pair/init',
      payload: {
        account_id: account.id,
        primary_device_id: primary.id,
        captcha_token: 'token-ok'
      }
    });
    expect(initRes.statusCode).toBe(201);
    const initBody = initRes.json();

    const completeRes = await server.app.inject({
      method: 'POST',
      url: '/v1/devices/pair/complete',
      payload: { pairing_token: initBody.pairing_token, new_device_pubkey: 'pubkey' }
    });
    expect(completeRes.statusCode).toBe(202);

    const approveRes = await server.app.inject({
      method: 'POST',
      url: '/v1/devices/pair/approve',
      payload: { pairing_token: initBody.pairing_token }
    });
    expect(approveRes.statusCode).toBe(200);
    await server.close();
  });

  it('rejects pairing init when captcha fails', async () => {
    const boot = await bootstrap({ services: { captcha: { verify: async () => false } } });
    const { server, container } = boot;
    const { account, primary } = await setupAccount(container);

    const initRes = await server.app.inject({
      method: 'POST',
      url: '/v1/devices/pair/init',
      payload: {
        account_id: account.id,
        primary_device_id: primary.id,
        captcha_token: 'token-bad'
      }
    });
    expect(initRes.statusCode).toBe(429);
    expect(initRes.json()).toMatchObject({ error: 'CAPTCHA_REQUIRED' });
    await server.close();
  });
});


