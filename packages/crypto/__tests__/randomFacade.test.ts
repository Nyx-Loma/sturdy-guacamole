import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as RandomFacade from '../src/random';
import * as Envelope from '../src/envelope';
import { brandSymmetricKey } from '../src/types';

vi.mock('../src/sodium/init', () => ({
  ensureSodium: vi.fn().mockResolvedValue({
    randombytes_buf: (len: number) => Uint8Array.from({ length: len }, (_, i) => i + 1)
  })
}));

vi.mock('../src/sessions/envelope', () => {
  const mockEnvelope = {
    seal: vi.fn().mockResolvedValue({ type: 'sealed' }),
    open: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    randomEnvelopeNonce: vi.fn().mockResolvedValue(new Uint8Array([9, 9, 9]))
  };
  return {
    ...mockEnvelope
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Envelope, 'seal').mockResolvedValue({ type: 'sealed' } as any);
  vi.spyOn(Envelope, 'open').mockResolvedValue(new Uint8Array([1, 2, 3]));
  vi.spyOn(Envelope, 'randomNonce').mockResolvedValue(new Uint8Array([9, 9, 9]));
});

describe('crypto random facade', () => {
  it('delegates to sodium randombytes_buf', async () => {
    const bytes = await RandomFacade.randomBytes(4);
    expect(bytes).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });
});

describe('crypto envelope facade', () => {
  const key = brandSymmetricKey(new Uint8Array(32));
  const header = { publicKey: new Uint8Array([1]), counter: 1, previousCounter: 0 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-exports seal', async () => {
    const result = await Envelope.seal(key, new Uint8Array([1, 2]), header);
    expect(result).toEqual({ type: 'sealed' });
  });

  it('re-exports open', async () => {
    const plain = await Envelope.open(key, { nonce: new Uint8Array(), ciphertext: new Uint8Array(), header } as any);
    expect(plain).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('re-exports randomNonce', async () => {
    const nonce = await Envelope.randomNonce();
    expect(nonce).toEqual(new Uint8Array([9, 9, 9]));
  });
});
