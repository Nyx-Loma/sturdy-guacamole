import { Buffer } from 'node:buffer';
import { brandPublicKey, brandSecretKey, brandSignature, KeySerializer, PublicKey, SecretKey, Signature } from './types';

const DEFAULT_ENCODING: BufferEncoding = 'base64url';

const toBuffer = (input: Uint8Array) => Buffer.from(input);

const fromString = (value: string, encoding: BufferEncoding) => {
  if (!value) {
    throw new Error('empty input');
  }
  return Buffer.from(value, encoding);
};

export const createKeySerializer = (): KeySerializer => ({
  encodePublicKey(key: PublicKey, encoding = DEFAULT_ENCODING) {
    return toBuffer(key).toString(encoding);
  },
  decodePublicKey(input: string, encoding = DEFAULT_ENCODING) {
    return brandPublicKey(new Uint8Array(fromString(input, encoding)));
  },
  encodeSecretKey(key: SecretKey, encoding = DEFAULT_ENCODING) {
    return toBuffer(key).toString(encoding);
  },
  decodeSecretKey(input: string, encoding = DEFAULT_ENCODING) {
    return brandSecretKey(new Uint8Array(fromString(input, encoding)));
  },
  encodeSignature(signature: Signature, encoding = DEFAULT_ENCODING) {
    return toBuffer(signature).toString(encoding);
  },
  decodeSignature(input: string, encoding = DEFAULT_ENCODING) {
    return brandSignature(new Uint8Array(fromString(input, encoding)));
  }
});

