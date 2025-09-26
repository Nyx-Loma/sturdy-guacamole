import type { Container } from '../../container';
import { RateLimitError } from '../../domain/errors';

interface RegisterDeviceInput {
  accountId: string;
  publicKey: string;
  displayName?: string;
}

export const registerDevice = async ({ repos, config }: Container, input: RegisterDeviceInput) => {
  const count = await repos.devices.countActiveForAccount(input.accountId);
  if (count >= config.limits.deviceMaxPerAccount) {
    throw new RateLimitError('device limit reached');
  }
  return repos.devices.create({
    accountId: input.accountId,
    publicKey: input.publicKey,
    displayName: input.displayName,
    status: 'active'
  });
};


