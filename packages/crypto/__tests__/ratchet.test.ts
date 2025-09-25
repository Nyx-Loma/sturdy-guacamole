import { describe, expect, it, beforeAll } from 'vitest';
import { Ratchet, Session, Asymmetric } from '../src/index';
import { ensureSodium } from '../src/sodium/init';

beforeAll(async () => {
  await ensureSodium();
});

describe('double ratchet', () => {
  it('round trips messages with ratchet steps', async () => {
    const aliceKeys = await Session.createSessionKeyPair();
    const bobKeys = await Session.createSessionKeyPair();

    const aliceSession = await Session.performHandshake(aliceKeys.secretKey, bobKeys.publicKey);
    const bobSession = await Session.performHandshake(bobKeys.secretKey, aliceKeys.publicKey);

    let aliceState = await Ratchet.initialize(aliceSession, aliceKeys, bobKeys.publicKey);
    let bobState = await Ratchet.initialize(bobSession, bobKeys, aliceKeys.publicKey);

    const message = new TextEncoder().encode('Hello Bob');
    const sendResult = await Ratchet.encrypt(aliceState, message);
    aliceState = sendResult.state;

    const recvResult = await Ratchet.decrypt(bobState, sendResult.envelope);
    bobState = recvResult.state;

    expect(new TextDecoder().decode(recvResult.plaintext)).toBe('Hello Bob');

    const reply = new TextEncoder().encode('Hello Alice');
    const replyEnvelope = await Ratchet.encrypt(bobState, reply);
    bobState = replyEnvelope.state;

    const recvAlice = await Ratchet.decrypt(aliceState, replyEnvelope.envelope);
    aliceState = recvAlice.state;
    expect(new TextDecoder().decode(recvAlice.plaintext)).toBe('Hello Alice');
  });

  it('stores skipped messages when counters jump', async () => {
    const alice = await Session.createSessionKeyPair();
    const bob = await Session.createSessionKeyPair();
    const aliceSession = await Session.performHandshake(alice.secretKey, bob.publicKey);
    const bobSession = await Session.performHandshake(bob.secretKey, alice.publicKey);

    let aliceState = await Ratchet.initialize(aliceSession, alice, bob.publicKey);
    let bobState = await Ratchet.initialize(bobSession, bob, alice.publicKey);

    const first = await Ratchet.encrypt(aliceState, new TextEncoder().encode('m1'));
    aliceState = first.state;

    const second = await Ratchet.encrypt(aliceState, new TextEncoder().encode('m2'));
    aliceState = second.state;

    const recvSecond = await Ratchet.decrypt(bobState, second.envelope);
    bobState = recvSecond.state;
    const recvFirst = await Ratchet.decrypt(bobState, first.envelope);
    bobState = recvFirst.state;

    expect(new TextDecoder().decode(recvSecond.plaintext)).toBe('m2');
    expect(new TextDecoder().decode(recvFirst.plaintext)).toBe('m1');
  });
});

