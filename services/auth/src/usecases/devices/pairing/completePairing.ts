import type { Container } from '../../../container';
import { ExpiredPairingError, NotFoundError } from '../../../domain/errors';

interface CompletePairingInput {
  pairingToken: string;
  newPublicKey: string;
}

export const completePairing = async ({ services }: Container, input: CompletePairingInput) => {
  return services.pairing.complete(input.pairingToken, input.newPublicKey);
};


