import type { Config } from '../../config';
import { InvalidSignatureError } from '../errors';
import type {
  CreateKeyResolverOptions,
  KeyMaterial,
  KeyResolver,
  KmsClient,
  SigningKeyRecord
} from './types';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

const kBase64 = 'base64';
const kBase64Url = 'base64url';
const kHex = 'hex';

const normalizeRecord = (record: SigningKeyRecord): KeyMaterial => {
  const { kid, material, encoding = kBase64Url, notAfter, active } = record;
  if (!kid || !material) {
    throw new InvalidSignatureError('kms returned incomplete signing key record');
  }

  let secret: Uint8Array;
  switch (encoding) {
    case kHex:
      secret = new Uint8Array(Buffer.from(material, 'hex'));
      break;
    case kBase64Url:
      secret = new Uint8Array(Buffer.from(material, 'base64url'));
      break;
    case kBase64:
      secret = new Uint8Array(Buffer.from(material, 'base64'));
      break;
    default:
      throw new InvalidSignatureError(`unsupported KMS encoding: ${encoding}`);
  }

  const normalized: KeyMaterial = {
    kid,
    secret,
    active: active ?? false,
    source: 'kms'
  };

  if (notAfter !== undefined) {
    normalized.notAfter = typeof notAfter === 'string' ? Date.parse(notAfter) : notAfter;
  }

  return normalized;
};

const loadFromEnv = (config: Config): KeyMaterial[] => {
  const activeKid = config.JWT_ACTIVE_KID;
  const primarySecret = config.JWT_SECRET;

  const encoder = new TextEncoder();
  const envKeys: KeyMaterial[] = [
    {
      kid: activeKid,
      secret: encoder.encode(primarySecret),
      active: true,
      source: 'env'
    }
  ];

  if (config.JWT_SECONDARY_SECRET && config.JWT_SECONDARY_KID) {
    envKeys.push({
      kid: config.JWT_SECONDARY_KID,
      secret: encoder.encode(config.JWT_SECONDARY_SECRET),
      notAfter: config.JWT_SECONDARY_NOT_AFTER,
      active: false,
      source: 'env'
    });
  }

  return envKeys;
};

const fetchKmsKeys = async (kmsClient: KmsClient): Promise<KeyMaterial[]> => {
  try {
    const records = await kmsClient.fetchSigningKeys();
    return records.map(normalizeRecord);
  } catch (error) {
    throw new InvalidSignatureError(`kms signing key fetch failed: ${(error as Error).message ?? 'unknown error'}`);
  }
};

const mergeKeys = (envKeys: KeyMaterial[], kmsKeys: KeyMaterial[]) => {
  const byKid = new Map<string, KeyMaterial>();
  for (const key of envKeys) {
    byKid.set(key.kid, key);
  }
  for (const key of kmsKeys) {
    byKid.set(key.kid, key);
  }
  return [...byKid.values()].sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));
};

export const createKeyResolver = (
  config: Config,
  { kmsClient, cacheTtlMs = DEFAULT_CACHE_TTL_MS, now = Date.now }: CreateKeyResolverOptions = {}
): KeyResolver => {
  let cachedKeys: KeyMaterial[] | undefined;
  let lastFetched = 0;

  const ensureKeys = async () => {
    const envKeys = loadFromEnv(config);
    const shouldRefresh = !cachedKeys || now() - lastFetched > cacheTtlMs;
    if (!kmsClient) {
      cachedKeys = envKeys;
      return cachedKeys;
    }
    if (!shouldRefresh) {
      return cachedKeys ?? envKeys;
    }

    const kmsKeys = await fetchKmsKeys(kmsClient);
    cachedKeys = mergeKeys(envKeys, kmsKeys);
    lastFetched = now();
    return cachedKeys;
  };

  const getActiveSigningKey = async () => {
    const keys = await ensureKeys();
    const active = keys.find((key) => key.active) ?? keys[0];
    if (!active) {
      throw new InvalidSignatureError('no signing keys available');
    }
    return active;
  };

  const getVerificationKeys = async () => {
    return ensureKeys();
  };

  return { getActiveSigningKey, getVerificationKeys };
};

