import sodium from 'libsodium-wrappers';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  await sodium.ready;
  if (!sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES) {
    throw new Error('libsodium self-test failed');
  }
});


