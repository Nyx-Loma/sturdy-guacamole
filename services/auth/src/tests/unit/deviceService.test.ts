import { describe, expect, it, vi } from 'vitest';
import { createDeviceService } from '../../domain/services/deviceService';
import { RateLimitError, NotFoundError } from '../../domain/errors';

const makeRepo = () => ({
  countActiveForAccount: vi.fn<() => Promise<number>>().mockResolvedValue(0),
  create: vi.fn().mockResolvedValue({ id: 'device', status: 'active' }),
  findById: vi.fn().mockResolvedValue({ id: 'device', status: 'active' }),
  update: vi.fn().mockResolvedValue(undefined),
  findByAccount: vi.fn().mockResolvedValue([{ id: 'device', status: 'active' }])
});

describe('deviceService', () => {
  it('registers device respecting limit', async () => {
    const repo = makeRepo();
    const service = createDeviceService(repo as any, 1);
    const device = await service.register('acc', 'pk');
    expect(device.status).toBe('active');
    expect(repo.create).toHaveBeenCalled();
  });

  it('throws when limit exceeded', async () => {
    const repo = makeRepo();
    repo.countActiveForAccount.mockResolvedValue(1);
    const service = createDeviceService(repo as any, 1);
    await expect(service.register('acc', 'pk')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('updates device', async () => {
    const repo = makeRepo();
    const service = createDeviceService(repo as any, 1);
    await service.update('device', { status: 'revoked' });
    expect(repo.update).toHaveBeenCalledWith('device', { status: 'revoked' });
  });

  it('throws when updating missing device', async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(null);
    const service = createDeviceService(repo as any, 1);
    await expect(service.update('missing', {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it('revokes all except provided id', async () => {
    const repo = makeRepo();
    repo.findByAccount.mockResolvedValue([
      { id: 'keep', status: 'revoked' },
      { id: 'drop', status: 'active' }
    ]);
    const service = createDeviceService(repo as any, 1);
    await service.revokeAllForAccount('acc', 'keep');
    expect(repo.update).toHaveBeenCalledWith('keep', { status: 'active' });
    expect(repo.update).toHaveBeenCalledWith('drop', { status: 'revoked' });
  });
});
