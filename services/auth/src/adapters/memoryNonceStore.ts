interface Entry {
  expiresAt: number;
}

export const createMemoryNonceStore = () => {
  const store = new Map<string, Entry>();

  const key = (deviceId: string, nonce: string) => `${deviceId}:${nonce}`;

  return {
    async issue(deviceId: string, nonce: string, ttlMs: number) {
      store.set(key(deviceId, nonce), { expiresAt: Date.now() + ttlMs });
    },
    async consume(deviceId: string, nonce: string) {
      const composite = key(deviceId, nonce);
      const entry = store.get(composite);
      if (!entry) return false;
      store.delete(composite);
      if (entry.expiresAt < Date.now()) return false;
      return true;
    }
  };
};


