import { hkdfExtract, hkdfExpand } from '../hkdf';
import { brandSymmetricKey, PublicKey, SecretKey, SymmetricKey } from '../types';
import * as Primitives from '../primitives';

const INFO_ROOT = new TextEncoder().encode('curly-spork root');
const INFO_CHAIN = new TextEncoder().encode('curly-spork chain');

export interface SessionSecrets {
  rootKey: SymmetricKey;
  chainKey: SymmetricKey;
}

export const performHandshake = async (localSecret: SecretKey, remotePublic: PublicKey): Promise<SessionSecrets> => {
  const shared = await Primitives.Asymmetric.deriveSharedSecret(localSecret, remotePublic);
  const prk = await hkdfExtract(undefined, shared);
  const rootKey = brandSymmetricKey(await hkdfExpand(prk, INFO_ROOT, 32));
  const chainKey = brandSymmetricKey(await hkdfExpand(prk, INFO_CHAIN, 32));
  return { rootKey, chainKey };
};

export const createSessionKeyPair = Primitives.Asymmetric.generateKeyAgreementKeyPair;

