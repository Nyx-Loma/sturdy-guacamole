import type { Container } from '../../container';
import { RateLimitError } from '../../domain/errors';

interface RegisterDeviceInput {
  accountId: string;
  publicKey: string;
  displayName?: string;
}

export const registerDevice = async ({ repos, config }: Container, input: RegisterDeviceInput) => {
  const limit = typeof config.DEVICE_MAX_PER_ACCOUNT_LIMIT_OVERRIDE === 'number'
    ? config.DEVICE_MAX_PER_ACCOUNT_LIMIT_OVERRIDE
    : config.DEVICE_MAX_PER_ACCOUNT;
  if (typeof limit !== 'number') {
    throw new Error('device registration requires DEVICE_MAX_PER_ACCOUNT limit');
  }
  const count = await repos.devices.countActiveForAccount(input.accountId);
  if (count >= limit) {
    throw new RateLimitError('device limit reached');
  }
  return repos.devices.create({
    accountId: input.accountId,
    publicKey: input.publicKey,
    displayName: input.displayName,
    status: 'active'
  });
};


