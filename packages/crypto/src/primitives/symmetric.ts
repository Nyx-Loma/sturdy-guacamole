import { ensureSodium } from '../sodium/init';
import { brandSymmetricKey, SymmetricKey } from '../types';
import { hkdfExtract, hkdfExpand } from '../hkdf';

const ALGORITHM = 'crypto_aead_xchacha20poly1305_ietf';

export const NONCE_BYTES = 24;

export const randomNonce = async (): Promise<Uint8Array> => {
  const sodium = await ensureSodium();
  const nonce = sodium.randombytes_buf(NONCE_BYTES);
  return new Uint8Array(nonce);
};

export interface EncryptOptions {
  additionalData?: Uint8Array;
}

export const encrypt = async (key: SymmetricKey, plaintext: Uint8Array, nonce: Uint8Array, options?: EncryptOptions) => {
  const sodium = await ensureSodium();
  const ad = options?.additionalData ?? new Uint8Array();
  const cipher = sodium[`${ALGORITHM}_encrypt`](plaintext, ad, undefined, nonce, key);
  return new Uint8Array(cipher);
};

export const decrypt = async (key: SymmetricKey, ciphertext: Uint8Array, nonce: Uint8Array, options?: EncryptOptions) => {
  const sodium = await ensureSodium();
  const ad = options?.additionalData ?? new Uint8Array();
  const plain = sodium[`${ALGORITHM}_decrypt`](undefined, ciphertext, ad, nonce, key);
  return new Uint8Array(plain);
};

export const deriveSymmetricKey = async (ikm: Uint8Array, info: Uint8Array, salt?: Uint8Array): Promise<SymmetricKey> => {
  const prk = await hkdfExtract(salt, ikm);
  const okm = await hkdfExpand(prk, info, 32);
  return brandSymmetricKey(okm);
};

