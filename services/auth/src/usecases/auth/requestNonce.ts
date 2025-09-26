import type { Container } from '../../container';
import { NotFoundError } from '../../domain/errors';

interface RequestNonceInput {
  accountId: string;
  deviceId: string;
}

export const requestDeviceNonce = async ({ repos, services }: Container, input: RequestNonceInput) => {
  const device = await repos.devices.findById(input.deviceId);
  if (!device || device.accountId !== input.accountId) {
    throw new NotFoundError('device not found');
  }
  const nonce = await services.deviceAssertion.generateNonce(device.id);
  return { nonce };
};


