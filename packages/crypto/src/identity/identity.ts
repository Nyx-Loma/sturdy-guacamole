import { Asymmetric } from '../primitives';
import { brandPublicKey, brandSecretKey, KeyPair } from '../types';

export const createIdentity = async (): Promise<KeyPair> => Asymmetric.generateSigningKeyPair();

export const serializeIdentity = (keyPair: KeyPair) => ({
  v: 1,
  publicKey: Buffer.from(keyPair.publicKey).toString('base64url'),
  secretKey: Buffer.from(keyPair.secretKey).toString('base64url')
});

export const deserializeIdentity = (input: { v: number; publicKey: string; secretKey: string }) => {
  if (input.v !== 1) throw new Error('unsupported identity version');
  return {
    publicKey: brandPublicKey(new Uint8Array(Buffer.from(input.publicKey, 'base64url'))),
    secretKey: brandSecretKey(new Uint8Array(Buffer.from(input.secretKey, 'base64url')))
  } satisfies KeyPair;
};

