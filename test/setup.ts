import { webcrypto } from 'node:crypto';

if (!(globalThis as { crypto?: Crypto }).crypto) {
  (globalThis as { crypto?: Crypto }).crypto = webcrypto as Crypto;
}
