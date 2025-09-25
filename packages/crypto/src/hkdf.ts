import { ensureSodium } from './sodium/init';
import { concatUint8 } from './utils/concat';

const HASH_LEN = 32;

export const hkdfExtract = async (salt: Uint8Array | undefined, ikm: Uint8Array) => {
  const sodium = await ensureSodium();
  const key = salt && salt.length > 0 ? salt : undefined;
  const prk = sodium.crypto_generichash(HASH_LEN, ikm, key);
  return new Uint8Array(prk);
};

export const hkdfExpand = async (prk: Uint8Array, info: Uint8Array, length: number) => {
  const sodium = await ensureSodium();
  const blocks = Math.ceil(length / HASH_LEN);
  if (blocks > 255) {
    throw new Error('hkdf expand too large');
  }

  let previous = new Uint8Array(0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (let i = 1; i <= blocks; i++) {
    const input = concatUint8(previous, info, new Uint8Array([i]));
    const block = new Uint8Array(sodium.crypto_generichash(HASH_LEN, input, prk));
    const slice = block.subarray(0, Math.min(HASH_LEN, length - offset));
    result.set(slice, offset);
    offset += slice.length;
    previous = block;
  }

  return result;
};

