import sodium from 'libsodium-wrappers';

let readyPromise: Promise<typeof sodium> | null = null;
let overrideInstance: typeof sodium | undefined;

export const ensureSodium = async () => {
  if (overrideInstance) return overrideInstance;
  if (!readyPromise) {
    readyPromise = sodium.ready.then(() => sodium);
  }
  return readyPromise;
};

export const __setSodiumForTests = (instance?: typeof sodium) => {
  overrideInstance = instance;
  if (!instance) {
    readyPromise = null;
  }
};

