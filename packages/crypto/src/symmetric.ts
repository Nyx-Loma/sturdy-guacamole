import { ensureSodium } from './sodium/init';
import { brandCipherText, brandNonce, brandSymmetricKey, CipherText, EncryptOptions, Nonce, SymmetricKey } from './types';

const ALGORITHM = 'crypto_aead_xchacha20poly1305_ietf';

export const NONCE_BYTES = 24;

export const randomNonce = async (): Promise<Nonce> => {
  const sodium = await ensureSodium();
  const nonce = sodium.randombytes_buf(NONCE_BYTES);
  return brandNonce(new Uint8Array(nonce));
};

export const encrypt = async (key: SymmetricKey, plaintext: Uint8Array, nonce: Nonce, options?: EncryptOptions): Promise<CipherText> => {
  const sodium = await ensureSodium();
  const ad = options?.additionalData ?? new Uint8Array();
  const cipher = sodium[`${ALGORITHM}_encrypt`](plaintext, ad, undefined, nonce, key);
  return brandCipherText(new Uint8Array(cipher));
};

export const decrypt = async (key: SymmetricKey, ciphertext: CipherText, nonce: Nonce, options?: EncryptOptions): Promise<Uint8Array> => {
  const sodium = await ensureSodium();
  const ad = options?.additionalData ?? new Uint8Array();
  const plain = sodium[`${ALGORITHM}_decrypt`](undefined, ciphertext, ad, nonce, key);
  return new Uint8Array(plain);
};

export const deriveSymmetricKey = async (ikm: Uint8Array, info: Uint8Array, subkeyId = 1, masterKey?: SymmetricKey): Promise<SymmetricKey> => {
  const sodium = await ensureSodium();
  const ctx = info.subarray(0, 8).length === 8 ? info : sodium.crypto_generichash(8, info);
  const baseKey = masterKey ?? brandSymmetricKey(new Uint8Array(sodium.crypto_kdf_keygen()));
  const derived = sodium.crypto_kdf_derive_from_key(32, subkeyId, ctx, baseKey);
  return brandSymmetricKey(new Uint8Array(derived));
};

