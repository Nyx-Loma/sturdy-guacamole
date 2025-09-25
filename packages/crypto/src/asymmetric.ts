import { ensureSodium } from './sodium/init';
import {
  brandPublicKey,
  brandSecretKey,
  brandSignature,
  KeyPair,
  PublicKey,
  SecretKey,
  Signature
} from './types';

export const generateSigningKeyPair = async (): Promise<KeyPair> => {
  const sodium = await ensureSodium();
  const { publicKey, privateKey } = sodium.crypto_sign_keypair('uint8array');
  return {
    publicKey: brandPublicKey(new Uint8Array(publicKey)),
    secretKey: brandSecretKey(new Uint8Array(privateKey))
  };
};

export const generateKeyAgreementKeyPair = async (): Promise<KeyPair> => {
  const sodium = await ensureSodium();
  const { publicKey, privateKey } = sodium.crypto_kx_keypair('uint8array');
  return {
    publicKey: brandPublicKey(new Uint8Array(publicKey)),
    secretKey: brandSecretKey(new Uint8Array(privateKey))
  };
};

export const sign = async (message: Uint8Array, secretKey: SecretKey): Promise<Signature> => {
  const sodium = await ensureSodium();
  const sig = sodium.crypto_sign_detached(message, secretKey);
  return brandSignature(new Uint8Array(sig));
};

export const verify = async (message: Uint8Array, signature: Signature, publicKey: PublicKey): Promise<boolean> => {
  const sodium = await ensureSodium();
  return sodium.crypto_sign_verify_detached(signature, message, publicKey);
};

export const deriveSharedSecret = async (secretKey: SecretKey, publicKey: PublicKey): Promise<Uint8Array> => {
  const sodium = await ensureSodium();
  const shared = sodium.crypto_scalarmult(secretKey.subarray(0, 32), publicKey.subarray(0, 32));
  return new Uint8Array(shared);
};

