import { describe, it, expect, vi } from 'vitest';
import { createDeviceService } from '../../domain/services/deviceService';

describe('deviceService.revokeAllForAccount', () => {
  it('revokes all devices except provided id and no-ops already revoked', async () => {
    const repo = {
      findByAccount: vi.fn().mockResolvedValue([
        { id: 'keep', status: 'active' },
        { id: 'revoke1', status: 'active' },
        { id: 'revoked', status: 'revoked' }
      ]),
      update: vi.fn(),
      countActiveForAccount: vi.fn(),
      create: vi.fn(),
      findById: vi.fn()
    } as any;
    const service = createDeviceService(repo, 10);
    await service.revokeAllForAccount('acc', 'keep');
    expect(repo.update).toHaveBeenCalledWith('keep', { status: 'active' });
    expect(repo.update).toHaveBeenCalledWith('revoke1', { status: 'revoked' });
    // should not update the already revoked one
    expect(repo.update).not.toHaveBeenCalledWith('revoked', expect.anything());
  });
});


