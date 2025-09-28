import { seal as sealEnvelope, open as openEnvelope, randomEnvelopeNonce } from './sessions/envelope';
export type { EnvelopeHeader, EncryptedEnvelope } from './sessions/envelope';

export const seal = sealEnvelope;
export const open = openEnvelope;
export const randomNonce = randomEnvelopeNonce;

