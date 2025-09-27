import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/sodium/init', async () => {
  return {
    ensureSodium: vi.fn()
  };
});

const { randomBytes } = await import('../src/primitives/random');
const { ensureSodium } = await import('../src/sodium/init');
const mockedEnsureSodium = vi.mocked(ensureSodium);

describe('primitives/random', () => {
  it('generates random bytes via sodium', async () => {
    const mockSodium = { randombytes_buf: vi.fn((len: number) => Uint8Array.from({ length: len }, (_, i) => i + 1)) };
    mockedEnsureSodium.mockResolvedValueOnce(mockSodium as unknown as typeof import('../src/sodium/init'));
    const bytes = await randomBytes(4);
    expect(bytes).toEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(mockSodium.randombytes_buf).toHaveBeenCalledWith(4);
  });

  it('propagates errors when sodium fails', async () => {
    mockedEnsureSodium.mockRejectedValueOnce(new Error('load failed'));
    await expect(randomBytes(4)).rejects.toThrow('load failed');
  });
});
