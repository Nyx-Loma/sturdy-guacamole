import { describe, it, expect } from 'vitest';
import { zeroize } from '../src/utils/memory';

describe('utils/memory', () => {
  it('scrubs buffers in-place and handles empty input', () => {
    const buf = new Uint8Array([1, 2, 3]);
    zeroize(buf);
    expect([...buf]).toEqual([0, 0, 0]);

    const empty = new Uint8Array([]);
    zeroize(empty);
    expect([...empty]).toEqual([]);
  });
});


