import { encrypt as encryptSym, decrypt as decryptSym, randomNonce } from './symmetric';
import { SymmetricKey, Nonce, CipherText } from './types';

export interface EnvelopeHeaders {
  additionalData?: Uint8Array;
}

export interface EncryptedEnvelope {
  nonce: Nonce;
  ciphertext: CipherText;
  headers?: EnvelopeHeaders;
}

export const seal = async (key: SymmetricKey, plaintext: Uint8Array, headers?: EnvelopeHeaders): Promise<EncryptedEnvelope> => {
  const nonce = await randomNonce();
  const ciphertext = await encryptSym(key, plaintext, nonce, { additionalData: headers?.additionalData });
  return { nonce, ciphertext, headers };
};

export const open = async (key: SymmetricKey, envelope: EncryptedEnvelope): Promise<Uint8Array> => {
  return decryptSym(key, envelope.ciphertext, envelope.nonce, { additionalData: envelope.headers?.additionalData });
};

