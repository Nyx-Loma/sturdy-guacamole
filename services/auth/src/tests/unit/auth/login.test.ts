import { describe, expect, it, vi, beforeEach } from 'vitest';
import { login } from '../../../usecases/auth/login';
import { NotFoundError, InvalidSignatureError } from '../../../domain/errors';

const createContainer = () => {
  const tokensRepo = {
    create: vi.fn(async (record) => record)
  };
  const container = {
    repos: {
      devices: {
        findById: vi.fn(async (id: string) => ({
          id,
          accountId: 'acc',
          publicKey: Buffer.from('pk').toString('base64'),
          status: 'active',
          createdAt: new Date()
        }))
      },
      tokens: tokensRepo
    },
    services: {
      deviceAssertion: {
        verify: vi.fn(async () => true)
      },
      tokens: {
        issueAccessToken: vi.fn(async () => 'access-token'),
        issueRefreshTokenId: vi.fn(() => 'refresh-id')
      }
    },
    config: {
      ACCESS_TOKEN_TTL_SECONDS: 60,
      REFRESH_TOKEN_TTL_MS: 120_000
    }
  } as any;
  return container;
};

const baseInput = () => ({
  accountId: 'acc',
  deviceId: 'device-1',
  deviceSignature: new Uint8Array([1, 2, 3]),
  nonce: 'nonce'
});

describe('auth login use case', () => {
  let container: ReturnType<typeof createContainer>;

  beforeEach(() => {
    container = createContainer();
  });

  it('throws when device not found', async () => {
    container.repos.devices.findById.mockResolvedValue(null);
    await expect(login(container, baseInput())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws when device belongs to another account', async () => {
    container.repos.devices.findById.mockResolvedValueOnce({
      id: 'device-1',
      accountId: 'other',
      publicKey: Buffer.from('pk').toString('base64'),
      status: 'active',
      createdAt: new Date()
    });
    await expect(login(container, baseInput())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws when device assertion fails', async () => {
    container.services.deviceAssertion.verify.mockResolvedValueOnce(false);
    await expect(login(container, baseInput())).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it('issues access and refresh tokens when assertion succeeds', async () => {
    const result = await login(container, baseInput());
    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-id', expiresIn: 60 });
    expect(container.services.tokens.issueAccessToken).toHaveBeenCalledWith({ accountId: 'acc', deviceId: 'device-1', kid: 'primary' });
    expect(container.services.tokens.issueRefreshTokenId).toHaveBeenCalled();
    expect(container.repos.tokens.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'refresh-id', accountId: 'acc', deviceId: 'device-1' }));
  });
});

