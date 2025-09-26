import { utils as edUtils, hashes } from '@noble/ed25519';
import { createHash } from 'node:crypto';

const hash512 = (message: Uint8Array) => {
  const digest = createHash('sha512').update(Buffer.from(message)).digest();
  return new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength);
};

hashes.sha512 = hash512;
edUtils.sha512Sync = hash512;
edUtils.sha512 = async (message: Uint8Array) => hash512(message);


