import { ensureSodium } from '../sodium/init';
import { brandCipherText, brandNonce, brandSymmetricKey, CipherText, EncryptOptions, Nonce, SymmetricKey } from '../types';

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
  const cipher = sodium[`${ALGORITHM}_encrypt`](plaintext, ad, null, nonce, key);
  return brandCipherText(new Uint8Array(cipher));
};

export const decrypt = async (key: SymmetricKey, ciphertext: CipherText, nonce: Nonce, options?: EncryptOptions): Promise<Uint8Array> => {
  const sodium = await ensureSodium();
  const ad = options?.additionalData ?? new Uint8Array();
  const plain = sodium[`${ALGORITHM}_decrypt`](null, ciphertext, ad, nonce, key);
  return new Uint8Array(plain);
};

export const deriveSymmetricKey = async (
  ikm: Uint8Array,
  info: Uint8Array,
  subkeyOrSalt: number | Uint8Array = 1,
  maybeMasterKey?: SymmetricKey,
  maybeSalt?: Uint8Array
): Promise<SymmetricKey> => {
  const sodium = await ensureSodium();

  let subkeyId = 1;
  const masterKey = maybeMasterKey;
  let salt = maybeSalt;

  if (typeof subkeyOrSalt === 'number') {
    if (!Number.isInteger(subkeyOrSalt) || subkeyOrSalt < 1) {
      throw new Error('subkeyId must be a positive integer');
    }
    subkeyId = subkeyOrSalt;
  } else {
    salt = subkeyOrSalt;
  }

  const contextBytes = info.length >= 8 ? info.subarray(0, 8) : sodium.crypto_generichash(8, info);
  const context = Buffer.from(contextBytes).toString('latin1');

  const baseKey = masterKey
    ?? (salt && salt.length > 0
      ? brandSymmetricKey(new Uint8Array(sodium.crypto_generichash(32, ikm, salt)))
      : brandSymmetricKey(ikm.length === sodium.crypto_kdf_KEYBYTES ? ikm : new Uint8Array(sodium.crypto_generichash(32, ikm))));

  const derived = sodium.crypto_kdf_derive_from_key(32, subkeyId, context, baseKey);
  return brandSymmetricKey(new Uint8Array(derived));
};

