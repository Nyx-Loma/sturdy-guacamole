import type { PairingToken } from '../domain/entities/pairing';

export type CreatePairingTokenInput = PairingToken;

export interface PairingRepository {
  create(token: CreatePairingTokenInput): Promise<PairingToken>;
  findByToken(token: string): Promise<PairingToken | null>;
  update(token: string, record: PairingToken): Promise<void>;
  markUsed(token: string): Promise<void>;
}


