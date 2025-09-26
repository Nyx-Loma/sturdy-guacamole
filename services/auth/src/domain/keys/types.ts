import type { Config } from '../../config';

export interface KeyMaterial {
  kid: string;
  secret: Uint8Array;
  notAfter?: number;
  active?: boolean;
  source: 'env' | 'kms';
}

export interface KeyResolver {
  getActiveSigningKey(): Promise<KeyMaterial>;
  getVerificationKeys(): Promise<KeyMaterial[]>;
}

export interface SigningKeyRecord {
  kid: string;
  material: string;
  encoding?: 'base64' | 'base64url' | 'hex' | 'utf8';
  notAfter?: number | string;
  active?: boolean;
}

export interface KmsClient {
  fetchSigningKeys(): Promise<SigningKeyRecord[]>;
}

export interface CreateKeyResolverOptions {
  kmsClient?: KmsClient;
  cacheTtlMs?: number;
  now?: () => number;
}

export type KeyResolverFactory = (config: Config, options?: CreateKeyResolverOptions) => KeyResolver;

