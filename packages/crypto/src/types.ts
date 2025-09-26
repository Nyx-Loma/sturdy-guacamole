import type { BufferEncoding } from 'node:buffer';

type Brand<T, B extends string> = T & { readonly __brand: B };

export type PublicKey = Brand<Uint8Array, 'PublicKey'>;
export type SecretKey = Brand<Uint8Array, 'SecretKey'>;
export type SymmetricKey = Brand<Uint8Array, 'SymmetricKey'>;
export type Nonce = Brand<Uint8Array, 'Nonce'>;
export type CipherText = Brand<Uint8Array, 'CipherText'>;
export type Signature = Brand<Uint8Array, 'Signature'>;

export interface EncryptOptions {
  additionalData?: Uint8Array;
}

export interface DecryptResult {
  plaintext: Uint8Array;
}

export interface KeyPair {
  publicKey: PublicKey;
  secretKey: SecretKey;
}

export interface CryptoProvider {
  randomBytes(length: number): Promise<Uint8Array>;
  generateKeyPair(): Promise<KeyPair>;
  deriveSymmetricKey(ikm: Uint8Array, info: Uint8Array, salt?: Uint8Array): Promise<SymmetricKey>;
  encrypt(key: SymmetricKey, plaintext: Uint8Array, nonce: Nonce, options?: EncryptOptions): Promise<CipherText>;
  decrypt(key: SymmetricKey, ciphertext: CipherText, nonce: Nonce, options?: EncryptOptions): Promise<DecryptResult>;
  sign(key: SecretKey, message: Uint8Array): Promise<Signature>;
  verify(key: PublicKey, message: Uint8Array, signature: Signature): Promise<boolean>;
}

export interface KeySerializer {
  encodePublicKey(key: PublicKey, encoding?: BufferEncoding): string;
  decodePublicKey(input: string, encoding?: BufferEncoding): PublicKey;
  encodeSecretKey(key: SecretKey, encoding?: BufferEncoding): string;
  decodeSecretKey(input: string, encoding?: BufferEncoding): SecretKey;
  encodeSignature(signature: Signature, encoding?: BufferEncoding): string;
  decodeSignature(input: string, encoding?: BufferEncoding): Signature;
}

export interface SessionSecrets {
  rootKey: SymmetricKey;
  chainKey: SymmetricKey;
}

export interface RatchetState {
  chainKey: SymmetricKey;
  counter: number;
}

export interface RatchetHeader {
  publicKey: PublicKey;
  counter: number;
  previousCounter: number;
  additionalData?: Uint8Array;
}

export const SYMMETRIC_KEY_BYTES = 32;
export const NONCE_BYTES = 24;
export const SIGNING_PUBLIC_KEY_BYTES = 32;
export const SIGNING_SECRET_KEY_BYTES = 64;
export const SIGNATURE_BYTES = 64;

export const brandPublicKey = (value: Uint8Array): PublicKey => value as PublicKey;
export const brandSecretKey = (value: Uint8Array): SecretKey => value as SecretKey;
export const brandSymmetricKey = (value: Uint8Array): SymmetricKey => value as SymmetricKey;
export const brandNonce = (value: Uint8Array): Nonce => value as Nonce;
export const brandCipherText = (value: Uint8Array): CipherText => value as CipherText;
export const brandSignature = (value: Uint8Array): Signature => value as Signature;

export const assertLength = (value: Uint8Array, expected: number, label: string) => {
  if (value.length !== expected) {
    throw new Error(`${label} must be ${expected} bytes, got ${value.length}`);
  }
};

