import { randomNonce, encrypt, decrypt } from '../primitives/symmetric';
import { SymmetricKey, PublicKey, CipherText, Nonce } from '../types';

export interface EnvelopeHeader {
  counter: number;
  previousCounter: number;
  publicKey: PublicKey;
  additionalData?: Uint8Array;
}

export interface EncryptedEnvelope {
  nonce: Nonce;
  ciphertext: CipherText;
  header: EnvelopeHeader;
}

export const seal = async (key: SymmetricKey, plaintext: Uint8Array, header: EnvelopeHeader): Promise<EncryptedEnvelope> => {
  const nonce = await randomNonce();
  const ciphertext = await encrypt(key, plaintext, nonce, { additionalData: header.additionalData });
  return { nonce, ciphertext, header };
};

export const open = async (key: SymmetricKey, envelope: EncryptedEnvelope): Promise<Uint8Array> => {
  return decrypt(key, envelope.ciphertext, envelope.nonce, { additionalData: envelope.header.additionalData });
};

export const randomEnvelopeNonce = randomNonce;

