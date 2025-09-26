import { randomBytes as randomBytesPrimitive } from './primitives/random';
import { deriveSymmetricKey as deriveSymmetricKeyPrimitive, encrypt as encryptPrimitive, decrypt as decryptPrimitive } from './primitives/symmetric';
import { generateSigningKeyPair as generateSigningKeyPairPrimitive, sign as signPrimitive, verify as verifyPrimitive } from './primitives/asymmetric';
import {
  brandCipherText,
  CipherText,
  CryptoProvider,
  DecryptResult,
  EncryptOptions,
  KeyPair,
  Nonce,
  PublicKey,
  SecretKey,
  Signature,
  SymmetricKey
} from './types';

export interface ProviderOverrides {
  randomBytes?: (length: number) => Promise<Uint8Array>;
  generateKeyPair?: () => Promise<KeyPair>;
  deriveSymmetricKey?: (ikm: Uint8Array, info: Uint8Array, salt?: Uint8Array) => Promise<SymmetricKey>;
  encrypt?: (key: SymmetricKey, plaintext: Uint8Array, nonce: Nonce, options?: EncryptOptions) => Promise<CipherText>;
  decrypt?: (key: SymmetricKey, ciphertext: CipherText, nonce: Nonce, options?: EncryptOptions) => Promise<DecryptResult>;
  sign?: (key: SecretKey, message: Uint8Array) => Promise<Signature>;
  verify?: (key: PublicKey, message: Uint8Array, signature: Signature) => Promise<boolean>;
  nonce?: () => Promise<Nonce>;
}

export const createCryptoProvider = (overrides: ProviderOverrides = {}): CryptoProvider => ({
  async randomBytes(length: number) {
    return overrides.randomBytes ? overrides.randomBytes(length) : randomBytesPrimitive(length);
  },
  async generateKeyPair() {
    return overrides.generateKeyPair ? overrides.generateKeyPair() : generateSigningKeyPairPrimitive();
  },
  async deriveSymmetricKey(ikm, info, salt) {
    if (overrides.deriveSymmetricKey) {
      return overrides.deriveSymmetricKey(ikm, info, salt);
    }
    return deriveSymmetricKeyPrimitive(ikm, info, salt);
  },
  async encrypt(key, plaintext, nonce, options) {
    if (overrides.encrypt) {
      return overrides.encrypt(key, plaintext, nonce, options);
    }
    const ciphertext = await encryptPrimitive(key, plaintext, nonce, options);
    return brandCipherText(ciphertext);
  },
  async decrypt(key, ciphertext, nonce, options) {
    if (overrides.decrypt) {
      return overrides.decrypt(key, ciphertext, nonce, options);
    }
    const plaintext = await decryptPrimitive(key, ciphertext, nonce, options);
    return { plaintext } satisfies DecryptResult;
  },
  async sign(key, message) {
    if (overrides.sign) {
      return overrides.sign(key, message);
    }
    return signPrimitive(message, key);
  },
  async verify(key, message, signature) {
    if (overrides.verify) {
      return overrides.verify(key, message, signature);
    }
    return verifyPrimitive(message, signature, key);
  },
  async nonce() {
    if (overrides.nonce) {
      return overrides.nonce();
    }
    return randomBytesPrimitive(24);
  }
});

