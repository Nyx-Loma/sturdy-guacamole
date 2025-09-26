import type { Container } from '../../../container';

interface ApprovePairingInput {
  pairingToken: string;
}

export const approvePairing = async ({ services }: Container, input: ApprovePairingInput) => {
  return services.pairing.approve(input.pairingToken);
};


