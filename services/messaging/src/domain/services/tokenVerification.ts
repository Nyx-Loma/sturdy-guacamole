import { importSPKI, importX509, type KeyLike } from 'jose';

const PEM_PUBLIC_KEY_HEADER = 'BEGIN PUBLIC KEY';
const PEM_CERTIFICATE_HEADER = 'BEGIN CERTIFICATE';

export const resolveVerificationKey = async (
  pem: string,
  algorithms: string[]
): Promise<KeyLike> => {
  const trimmed = pem.trim();
  if (!trimmed.includes(PEM_PUBLIC_KEY_HEADER) && !trimmed.includes(PEM_CERTIFICATE_HEADER)) {
    throw new Error('Unsupported PEM content for JWT verification');
  }

  const preferredAlgs = algorithms.length > 0 ? algorithms : ['RS256'];
  let lastError: unknown;

  for (const alg of preferredAlgs) {
    try {
      if (trimmed.includes(PEM_CERTIFICATE_HEADER)) {
        return await importX509(trimmed, alg);
      }
      return await importSPKI(trimmed, alg);
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to import verification key for configured algorithms');
};


