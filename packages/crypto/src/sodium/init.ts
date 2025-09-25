import sodium from 'libsodium-wrappers';

let readyPromise: Promise<typeof sodium> | null = null;

export const ensureSodium = async () => {
  if (!readyPromise) {
    readyPromise = sodium.ready.then(() => sodium);
  }
  return readyPromise;
};

