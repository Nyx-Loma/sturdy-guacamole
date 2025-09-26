import { ensureSodium } from '../sodium/init';

export const randomBytes = async (length: number) => {
  const sodium = await ensureSodium();
  return new Uint8Array(sodium.randombytes_buf(length));
};

