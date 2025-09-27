import { describe, expect, it } from 'vitest';
import { compareUint8 } from '../src/utils/compare';

describe('compareUint8', () => {
  it('returns true for equal arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(compareUint8(a, b)).toBe(true);
  });

  it('returns false for different length arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2]);
    expect(compareUint8(a, b)).toBe(false);
  });

  it('returns false when any byte differs', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 9, 3]);
    expect(compareUint8(a, b)).toBe(false);
  });
});
