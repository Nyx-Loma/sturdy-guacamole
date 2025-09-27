import type { Container } from '../../../container';

interface CompletePairingInput {
  pairingToken: string;
  newPublicKey: string;
}

export const completePairing = async ({ services }: Container, input: CompletePairingInput) => {
  return services.pairing.complete(input.pairingToken, input.newPublicKey);
};


