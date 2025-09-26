import { describe, it, expect } from 'vitest';
import { serializeState, deserializeState } from '../src/sessions/state';
import type { RatchetState, SymmetricKey } from '../src/types';

const makeKey = (seed: number): SymmetricKey => {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = (seed + i) & 0xff;
  }
  return bytes as SymmetricKey;
};

const makeState = () => {
  const rootKey = makeKey(10);
  const send: RatchetState = { chainKey: makeKey(20), counter: 5 };
  const receive: RatchetState = { chainKey: makeKey(30), counter: 2 };
  const skipped = new Map<string, SymmetricKey>();
  skipped.set('header-1', makeKey(40));
  skipped.set('header-2', makeKey(50));
  return { rootKey, send, receive, skipped };
};

describe('session state serialization', () => {
  it('serializes and deserializes with integrity verification', () => {
    const { rootKey, send, receive, skipped } = makeState();
    const serialized = serializeState(rootKey, send, receive, skipped);
    const restored = deserializeState(serialized);

    expect(restored.send.counter).toBe(send.counter);
    expect(restored.receive.counter).toBe(receive.counter);
    expect(restored.skipped.size).toBe(skipped.size);
    expect(restored.rootKey).toBeInstanceOf(Uint8Array);
  });

  it('rejects tampered macs', () => {
    const { rootKey, send, receive, skipped } = makeState();
    const serialized = serializeState(rootKey, send, receive, skipped);
    const tampered = { ...serialized, mac: serialized.mac.replace(/.$/, serialized.mac.slice(-1) === 'A' ? 'B' : 'A') };
    expect(() => deserializeState(tampered)).toThrow('session state integrity check failed');
  });

  it('rejects tampered payload', () => {
    const { rootKey, send, receive, skipped } = makeState();
    const serialized = serializeState(rootKey, send, receive, skipped);
    const tampered = { ...serialized, sendCounter: serialized.sendCounter + 1 };
    expect(() => deserializeState(tampered)).toThrow('session state integrity check failed');
  });
});


