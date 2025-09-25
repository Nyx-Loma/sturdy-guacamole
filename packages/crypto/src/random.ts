import { ensureSodium } from './sodium/init';

export const randomBytes = async (length: number): Promise<Uint8Array> => {
  const sodium = await ensureSodium();
  const buf = sodium.randombytes_buf(length);
  return new Uint8Array(buf);
};

