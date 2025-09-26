import type { Container } from '../../../container';

interface InitPairingInput {
  accountId: string;
  primaryDeviceId: string;
  displayName?: string;
}

export const initPairing = async ({ repos, services }: Container, input: InitPairingInput) => {
  if (input.accountId === input.primaryDeviceId) {
    throw new Error('primary device must belong to account');
  }
  const account = await repos.accounts.findById(input.accountId);
  if (!account) throw new Error('account not found');
  const primary = await repos.devices.findById(input.primaryDeviceId);
  if (!primary || primary.accountId !== input.accountId) {
    throw new Error('primary device not found');
  }
  return services.pairing.init(input.accountId, input.primaryDeviceId, input.displayName);
};


