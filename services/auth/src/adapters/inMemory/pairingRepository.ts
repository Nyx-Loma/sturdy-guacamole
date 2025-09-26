import type { PairingToken } from '../../domain/entities/pairing';
import type { PairingRepository } from '../../repositories/pairingRepo';

export const createInMemoryPairingRepository = (): PairingRepository => {
  const store = new Map<string, PairingToken>();
  return {
    async create(token) {
      store.set(token.token, token);
      return token;
    },
    async findByToken(token) {
      return store.get(token) ?? null;
    },
    async update(token, record) {
      store.set(token, record);
    },
    async markUsed(token) {
      const current = store.get(token);
      if (current) {
        store.set(token, { ...current, used: true, usedAt: new Date() });
      }
    }
  };
};


