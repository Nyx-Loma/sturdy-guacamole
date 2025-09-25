import { encrypt as encryptSym, decrypt as decryptSym, randomNonce } from './symmetric';
import { SymmetricKey, Nonce, CipherText } from './types';

export interface EnvelopeHeaders {
  additionalData?: Uint8Array;
}

export interface EnvelopeHeader {
  counter: number;
  publicKey: Uint8Array;
  additionalData?: Uint8Array;
}

export interface EncryptedEnvelope {
  nonce: Nonce;
  ciphertext: CipherText;
  header: EnvelopeHeader;
}

export const seal = async (key: SymmetricKey, plaintext: Uint8Array, header: EnvelopeHeader): Promise<EncryptedEnvelope> => {
  const nonce = await randomNonce();
  const ciphertext = await encryptSym(key, plaintext, nonce, { additionalData: header.additionalData });
  return { nonce, ciphertext, header };
};

export const open = async (key: SymmetricKey, envelope: EncryptedEnvelope): Promise<Uint8Array> => {
  return decryptSym(key, envelope.ciphertext, envelope.nonce, { additionalData: envelope.header.additionalData });
};

