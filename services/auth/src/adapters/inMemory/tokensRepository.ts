import type { RefreshToken } from '../../domain/entities/tokens';
import type { TokensRepository } from '../../repositories/tokensRepo';

export const createInMemoryTokensRepository = (): TokensRepository => {
  const tokens = new Map<string, RefreshToken>();
  return {
    async create(token) {
      tokens.set(token.id, token);
      return token;
    },
    async findById(id) {
      return tokens.get(id) ?? null;
    },
    async revoke(id) {
      const token = tokens.get(id);
      if (token) {
        tokens.set(id, { ...token, revokedAt: new Date() });
      }
    },
    async revokeAllForDevice(deviceId) {
      for (const token of tokens.values()) {
        if (token.deviceId === deviceId && !token.revokedAt) {
          tokens.set(token.id, { ...token, revokedAt: new Date() });
        }
      }
    },
    async revokeAllForAccount(accountId) {
      for (const token of tokens.values()) {
        if (token.accountId === accountId && !token.revokedAt) {
          tokens.set(token.id, { ...token, revokedAt: new Date() });
        }
      }
    }
  };
};


