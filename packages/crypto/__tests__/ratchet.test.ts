import { describe, expect, it, beforeAll } from 'vitest';
import { Ratchet, Sessions } from '../src/index';
import { ensureSodium } from '../src/sodium/init';

beforeAll(async () => {
  await ensureSodium();
});

const tc = (text: string) => new TextEncoder().encode(text);

const initStates = async (options?: { maxSkipped?: number }) => {
  const aliceKeys = await Sessions.createSessionKeyPair();
  const bobKeys = await Sessions.createSessionKeyPair();

  const aliceSession = await Sessions.performHandshake(aliceKeys.secretKey, bobKeys.publicKey);
  const bobSession = await Sessions.performHandshake(bobKeys.secretKey, aliceKeys.publicKey);

  const aliceState = await Ratchet.initialize(aliceSession, aliceKeys, bobKeys.publicKey, options);
  const bobState = await Ratchet.initialize(bobSession, bobKeys, aliceKeys.publicKey, options);
  return { aliceState, bobState };
};

describe('double ratchet', () => {
  it('round trips messages with ratchet steps', async () => {
    let { aliceState, bobState } = await initStates();

    const sendResult = await Ratchet.encrypt(aliceState, tc('Hello Bob'));
    aliceState = sendResult.state;

    const recvResult = await Ratchet.decrypt(bobState, sendResult.envelope);
    bobState = recvResult.state;

    expect(new TextDecoder().decode(recvResult.plaintext)).toBe('Hello Bob');

    const replyEnvelope = await Ratchet.encrypt(bobState, tc('Hello Alice'));
    bobState = replyEnvelope.state;

    const recvAlice = await Ratchet.decrypt(aliceState, replyEnvelope.envelope);
    aliceState = recvAlice.state;
    expect(new TextDecoder().decode(recvAlice.plaintext)).toBe('Hello Alice');
  });

  it('stores skipped messages when counters jump', async () => {
    let { aliceState, bobState } = await initStates();

    const first = await Ratchet.encrypt(aliceState, tc('m1'));
    aliceState = first.state;
    const second = await Ratchet.encrypt(aliceState, tc('m2'));
    aliceState = second.state;

    const recvSecond = await Ratchet.decrypt(bobState, second.envelope);
    bobState = recvSecond.state;
    const recvFirst = await Ratchet.decrypt(bobState, first.envelope);
    bobState = recvFirst.state;

    expect(new TextDecoder().decode(recvSecond.plaintext)).toBe('m2');
    expect(new TextDecoder().decode(recvFirst.plaintext)).toBe('m1');
  });

  it('enforces skipped message limit', async () => {
    let { aliceState, bobState } = await initStates({ maxSkipped: 1 });

    const first = await Ratchet.encrypt(aliceState, tc('m1'));
    aliceState = first.state;
    const second = await Ratchet.encrypt(aliceState, tc('m2'));
    aliceState = second.state;
    const third = await Ratchet.encrypt(aliceState, tc('m3'));
    aliceState = third.state;

    const thirdRecv = await Ratchet.decrypt(bobState, third.envelope);
    bobState = thirdRecv.state;

    await expect(Ratchet.decrypt(bobState, first.envelope)).rejects.toThrow();
  });
});

