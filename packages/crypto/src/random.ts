import { ensureSodium } from './sodium/init';

export const randomBytes = async (length: number): Promise<Uint8Array> => {
  const sodium = await ensureSodium();
  return new Uint8Array(sodium.randombytes_buf(length));
};

