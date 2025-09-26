import argon2 from 'argon2';
import type { RecoveryRepository } from '../../repositories/recoveryRepo';
import type { RecoveryRecord } from '../entities/recovery';
import { InvalidRecoveryCodeError, NotFoundError } from '../errors';

export interface RecoveryConfig {
  timeCost: number;
  memoryCost: number;
  parallelism: number;
  version: number;
}

export const createRecoveryService = (repo: RecoveryRepository, config: RecoveryConfig) => {
  const hash = async (code: string) => {
    return argon2.hash(code, {
      type: argon2.argon2id,
      timeCost: config.timeCost,
      memoryCost: config.memoryCost,
      parallelism: config.parallelism
    });
  };

  const setup = async (accountId: string, code: string) => {
    if (config.memoryCost < 16384 || config.timeCost < 2) {
      throw new Error('argon2 parameters below policy baseline');
    }
    const rcHash = await hash(code);
    const record: RecoveryRecord = {
      accountId,
      rcHash,
      params: {
        timeCost: config.timeCost,
        memoryCost: config.memoryCost,
        parallelism: config.parallelism,
        version: config.version
      },
      updatedAt: new Date()
    };
    await repo.upsert(record);
  };

  const verify = async (accountId: string, code: string) => {
    const record = await repo.find(accountId);
    if (!record) throw new NotFoundError('recovery record not found');
    if (record.params.version !== config.version) {
      throw new Error('recovery code requires rehash');
    }
    const ok = await argon2.verify(record.rcHash, code);
    return ok;
  };

  const consume = async (accountId: string, code: string) => {
    let ok: boolean;
    try {
      ok = await verify(accountId, code);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new InvalidRecoveryCodeError();
      }
      throw error;
    }
    if (!ok) {
      throw new InvalidRecoveryCodeError();
    }
    await repo.delete(accountId);
    return true;
  };

  return { setup, verify, consume };
};


