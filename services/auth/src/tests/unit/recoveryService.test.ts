import { describe, expect, it } from 'vitest';
import { createRecoveryService } from '../../domain/services/recoveryService';
import { createInMemoryRecoveryRepository } from '../../adapters/inMemory/recoveryRepository';
import { InvalidRecoveryCodeError, NotFoundError } from '../../domain/errors';

const repo = createInMemoryRecoveryRepository();
const strongConfig = { timeCost: 3, memoryCost: 65536, parallelism: 1, version: 1 };
const service = createRecoveryService(repo, strongConfig);

describe('recovery service', () => {
  it('hashes and verifies recovery code', async () => {
    await service.setup('acc', 'secret-code');
    const ok = await service.verify('acc', 'secret-code');
    expect(ok).toBe(true);
    const bad = await service.verify('acc', 'wrong');
    expect(bad).toBe(false);
  });

  it('overwrites existing recovery codes', async () => {
    await service.setup('acc', 'old-code');
    await service.setup('acc', 'new-code');
    const ok = await service.verify('acc', 'new-code');
    expect(ok).toBe(true);
    const bad = await service.verify('acc', 'old-code');
    expect(bad).toBe(false);
  });

  it('consumes code on success and rejects reuse', async () => {
    await service.setup('acc-consume', 'one-shot');
    await expect(service.consume('acc-consume', 'one-shot')).resolves.toBe(true);
    await expect(service.consume('acc-consume', 'one-shot')).rejects.toBeInstanceOf(InvalidRecoveryCodeError);
  });

  it('throws when record missing', async () => {
    await expect(service.verify('missing', 'any')).rejects.toThrow(NotFoundError);
  });

  it('rejects verification if policy version changed', async () => {
    const repo2 = createInMemoryRecoveryRepository();
    const oldService = createRecoveryService(repo2, { ...strongConfig, version: 0 });
    await oldService.setup('acc', 'code');
    const newService = createRecoveryService(repo2, strongConfig);
    await expect(newService.verify('acc', 'code')).rejects.toThrow('recovery code requires rehash');
  });
});


