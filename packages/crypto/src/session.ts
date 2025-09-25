import { hkdfExtract, hkdfExpand } from './hkdf';
import { brandSymmetricKey, PublicKey, SecretKey, SymmetricKey } from './types';
import { deriveSharedSecret, generateKeyAgreementKeyPair } from './asymmetric';

export interface SessionSecrets {
  rootKey: SymmetricKey;
  chainKey: SymmetricKey;
}

const INFO_ROOT = new TextEncoder().encode('curly-spork root');
const INFO_CHAIN = new TextEncoder().encode('curly-spork chain');

export const performHandshake = async (localSecret: SecretKey, remotePublic: PublicKey): Promise<SessionSecrets> => {
  const shared = await deriveSharedSecret(localSecret, remotePublic);
  const prk = await hkdfExtract(undefined, shared);
  const rootKey = brandSymmetricKey(await hkdfExpand(prk, INFO_ROOT, 32));
  const chainKey = brandSymmetricKey(await hkdfExpand(prk, INFO_CHAIN, 32));
  return { rootKey, chainKey };
};

export const createSessionKeyPair = async () => {
  const { publicKey, secretKey } = await generateKeyAgreementKeyPair();
  return { publicKey, secretKey } as const;
};

