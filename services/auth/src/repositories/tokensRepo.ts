import type { RefreshToken } from '../domain/entities/tokens';

export type CreateRefreshTokenInput = Omit<RefreshToken, 'revokedAt'>;

export interface TokensRepository {
  create(token: CreateRefreshTokenInput): Promise<RefreshToken>;
  findById(id: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<void>;
  revokeAllForDevice(deviceId: string): Promise<void>;
  revokeAllForAccount(accountId: string): Promise<void>;
}


