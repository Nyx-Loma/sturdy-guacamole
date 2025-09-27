import { hkdfExtract, hkdfExpand } from '../hkdf';

const INFO_KEK = new TextEncoder().encode('sanctum/kek');
const INFO_NONCE = new TextEncoder().encode('sanctum/nonce');
const INFO_VERIFIER = new TextEncoder().encode('sanctum/verifier');

export interface DeriveOptions {
  salt: Uint8Array;
  kekLength?: number;
  nonceLength?: number;
  verifierLength?: number;
}

export interface DerivedMaterial {
  kek: Uint8Array;
  keyNonce: Uint8Array;
  verifierSeed: Uint8Array;
}

export const deriveMaterial = async (mrc: Uint8Array, { salt, kekLength = 32, nonceLength = 24, verifierLength = 32 }: DeriveOptions): Promise<DerivedMaterial> => {
  const prk = await hkdfExtract(salt, mrc);
  const kek = await hkdfExpand(prk, INFO_KEK, kekLength);
  const keyNonce = await hkdfExpand(prk, INFO_NONCE, nonceLength);
  const verifierSeed = await hkdfExpand(prk, INFO_VERIFIER, verifierLength);
  return { kek, keyNonce, verifierSeed };
};
