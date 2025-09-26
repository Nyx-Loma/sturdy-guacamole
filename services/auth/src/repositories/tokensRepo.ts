import type { RefreshToken } from '../domain/entities/tokens';

export interface TokensRepository {
  create(token: RefreshToken): Promise<RefreshToken>;
  findById(id: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<void>;
  revokeAllForDevice(deviceId: string): Promise<void>;
  revokeAllForAccount(accountId: string): Promise<void>;
}


