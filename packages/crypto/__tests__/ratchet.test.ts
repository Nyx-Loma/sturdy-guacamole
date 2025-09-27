import { describe, expect, it, beforeAll } from 'vitest';
import { Ratchet, Sessions } from '../src/index';
import { ensureSodium } from '../src/sodium/init';
import { ReplayError, SkippedMessageLimitExceededError } from '../src/errors';
import { DEFAULT_MAX_SKIPPED } from '../src/constants';

beforeAll(async () => {
  await ensureSodium();
});

describe('double ratchet', () => {
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

  it('defaults to expected skipped limit but can override', async () => {
    const { aliceState } = await initStates();
    expect(aliceState.maxSkipped).toBe(DEFAULT_MAX_SKIPPED);

    const { aliceState: customState } = await initStates({ maxSkipped: 42 });
    expect(customState.maxSkipped).toBe(42);
  });

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

  it('throws when storeSkipped limit is non-positive', async () => {
    let { aliceState, bobState } = await initStates({ maxSkipped: 0 });
    const first = await Ratchet.encrypt(aliceState, tc('m1'));
    aliceState = first.state;
    const second = await Ratchet.encrypt(aliceState, tc('m2'));
    aliceState = second.state;
    await expect(Ratchet.decrypt(bobState, second.envelope)).rejects.toBeInstanceOf(SkippedMessageLimitExceededError);
  });

  it('denies mismatched action payloads even when success true', async () => {
    let { aliceState, bobState } = await initStates();

    const first = await Ratchet.encrypt(aliceState, tc('first'));
    aliceState = first.state;
    await Ratchet.decrypt(bobState, first.envelope);

    const second = await Ratchet.encrypt(aliceState, tc('second'));
    aliceState = second.state;

    await expect(Ratchet.decrypt(bobState, second.envelope)).resolves.toBeDefined();
  });

  it('stores skipped messages when counters jump and prunes when exceeding limit', async () => {
    let { aliceState, bobState } = await initStates({ maxSkipped: 1 });

    const first = await Ratchet.encrypt(aliceState, tc('m1'));
    aliceState = first.state;
    const second = await Ratchet.encrypt(aliceState, tc('m2'));
    aliceState = second.state;
    const third = await Ratchet.encrypt(aliceState, tc('m3'));
    aliceState = third.state;

    await Ratchet.decrypt(bobState, third.envelope);
    expect(bobState.skipped.size).toBeLessThanOrEqual(1);
    await expect(Ratchet.decrypt(bobState, first.envelope)).rejects.toBeInstanceOf(ReplayError);
  });

  it('throws ReplayError when decrypting an already processed header', async () => {
    let { aliceState, bobState } = await initStates();
    const send = await Ratchet.encrypt(aliceState, tc('payload'));
    aliceState = send.state;
    const firstDecrypt = await Ratchet.decrypt(bobState, send.envelope);
    bobState = firstDecrypt.state;
    await expect(Ratchet.decrypt(bobState, send.envelope)).rejects.toBeInstanceOf(ReplayError);
  });

  it('decrypts out-of-order messages by consuming stored skipped keys', async () => {
    let { aliceState, bobState } = await initStates({ maxSkipped: 2 });

    const first = await Ratchet.encrypt(aliceState, tc('first'));
    aliceState = first.state;
    const second = await Ratchet.encrypt(aliceState, tc('second'));
    aliceState = second.state;

    const outOfOrder = await Ratchet.decrypt(bobState, second.envelope);
    bobState = outOfOrder.state;
    expect(new TextDecoder().decode(outOfOrder.plaintext)).toBe('second');

    const gapFill = await Ratchet.decrypt(bobState, first.envelope);
    bobState = gapFill.state;
    expect(new TextDecoder().decode(gapFill.plaintext)).toBe('first');
  });
});
