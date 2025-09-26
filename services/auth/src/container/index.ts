import type { Config } from '../config';
import type { Logger } from 'pino';
import { createTokenService } from '../domain/services/tokenService';
import { createDeviceAssertionService } from '../domain/services/deviceAssertion';
import { createAccountService } from '../domain/services/accountService';
import { createDeviceService } from '../domain/services/deviceService';
import { createPairingService } from '../domain/services/pairingService';
import { createInMemoryAccountsRepository } from '../adapters/inMemory/accountsRepository';
import { createInMemoryDevicesRepository } from '../adapters/inMemory/devicesRepository';
import { createInMemoryTokensRepository } from '../adapters/inMemory/tokensRepository';
import { createInMemoryPairingRepository } from '../adapters/inMemory/pairingRepository';
import { createInMemoryRecoveryRepository } from '../adapters/inMemory/recoveryRepository';
import { createMemoryNonceStore } from '../adapters/memoryNonceStore';
import { createRedisNonceStore, createRedisPairingStore, getRedisClient } from '../adapters/redis';
import {
  createPostgresAccountsRepository,
  createPostgresDevicesRepository,
  createPostgresTokensRepository,
  createPostgresPairingRepository,
  createPostgresRecoveryRepository
} from '../adapters/postgres';
import { getPool } from '../adapters/postgres/pool';
import { createKeyResolver } from '../domain/keys';
import { createCaptchaService } from '../domain/captcha/service';

export interface Container {
  config: Config;
  logger: Logger;
  repos: {
    accounts: ReturnType<typeof createInMemoryAccountsRepository> | ReturnType<typeof createPostgresAccountsRepository>;
    devices: ReturnType<typeof createInMemoryDevicesRepository> | ReturnType<typeof createPostgresDevicesRepository>;
    tokens: ReturnType<typeof createInMemoryTokensRepository> | ReturnType<typeof createPostgresTokensRepository>;
    pairing: ReturnType<typeof createInMemoryPairingRepository> | ReturnType<typeof createPostgresPairingRepository>;
    recovery: ReturnType<typeof createInMemoryRecoveryRepository> | ReturnType<typeof createPostgresRecoveryRepository>;
  };
  services: {
    tokens: ReturnType<typeof createTokenService>;
    deviceAssertion: ReturnType<typeof createDeviceAssertionService>;
    accounts: ReturnType<typeof createAccountService>;
    devices: ReturnType<typeof createDeviceService>;
    pairing: ReturnType<typeof createPairingService>;
    captcha: ReturnType<typeof createCaptchaService>;
  };
}

const buildRepositories = (config: Config) => {
  if (config.STORAGE_DRIVER === 'postgres') {
    const pool = getPool(config);
    return {
      accounts: createPostgresAccountsRepository(pool),
      devices: createPostgresDevicesRepository(pool),
      tokens: createPostgresTokensRepository(pool),
      pairing: createPostgresPairingRepository(pool),
      recovery: createPostgresRecoveryRepository(pool)
    } as const;
  }

  return {
    accounts: createInMemoryAccountsRepository(),
    devices: createInMemoryDevicesRepository(),
    tokens: createInMemoryTokensRepository(),
    pairing: createInMemoryPairingRepository(),
    recovery: createInMemoryRecoveryRepository()
  } as const;
};

export const createContainer = async ({ config, logger }: { config: Config; logger: Logger }): Promise<Container> => {
  const repos = buildRepositories(config);
  const tokenService = createTokenService({ config, keyResolver: createKeyResolver(config) });
  const accountService = createAccountService(repos.accounts);
  const deviceService = createDeviceService(repos.devices, config.DEVICE_MAX_PER_ACCOUNT);
  const nonceStore = config.REDIS_URL
    ? createRedisNonceStore(getRedisClient(config))
    : createMemoryNonceStore();
  const deviceAssertion = createDeviceAssertionService(nonceStore, 60_000);
  const pairingCache = config.REDIS_URL ? createRedisPairingStore(getRedisClient(config)) : undefined;
  const pairingService = createPairingService(repos.pairing, config.PAIRING_TOKEN_TTL_SECONDS, pairingCache);
  const captchaService = createCaptchaService(config);

  return {
    config,
    logger,
    repos,
    services: {
      tokens: tokenService,
      deviceAssertion,
      accounts: accountService,
      devices: deviceService,
      pairing: pairingService,
      captcha: captchaService
    }
  };
};


