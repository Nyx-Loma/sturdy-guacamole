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
  createPostgresRecoveryRepository,
  getPool
} from '../adapters/postgres';
import { runMigrations } from '../adapters/postgres/migrate';
import { createKeyResolver } from '../domain/keys';
import { createCaptchaService } from '../domain/captcha/service';
import { createRecoveryBackupService } from '../domain/services/recoveryBackup';
import { AuthMetrics } from '../domain/metrics';
import { createRecoveryService } from '../domain/services/recoveryService';

type AccountsRepo = ReturnType<typeof createInMemoryAccountsRepository> | ReturnType<typeof createPostgresAccountsRepository>;
type DevicesRepo = ReturnType<typeof createInMemoryDevicesRepository> | ReturnType<typeof createPostgresDevicesRepository>;
type TokensRepo = ReturnType<typeof createInMemoryTokensRepository> | ReturnType<typeof createPostgresTokensRepository>;
type PairingRepo = ReturnType<typeof createInMemoryPairingRepository> | ReturnType<typeof createPostgresPairingRepository>;
type RecoveryRepo = ReturnType<typeof createInMemoryRecoveryRepository> | ReturnType<typeof createPostgresRecoveryRepository>;

type BackupService = ReturnType<typeof createRecoveryBackupService>;

type DeviceService = ReturnType<typeof createDeviceService> & {
  revokeAllForAccount(accountId: string, exceptDeviceId?: string): Promise<void>;
};

type TokenService = ReturnType<typeof createTokenService> & {
  revokeAllForAccount(tokens: Pick<TokensRepo, 'revokeAllForAccount'>, accountId: string): Promise<void>;
};

export interface Container {
  config: Config;
  logger: Logger;
  repos: {
    accounts: AccountsRepo;
    devices: DevicesRepo;
    tokens: TokensRepo;
    pairing: PairingRepo;
    recovery: RecoveryRepo;
  };
  services: {
    tokens: TokenService;
    deviceAssertion: ReturnType<typeof createDeviceAssertionService>;
    accounts: ReturnType<typeof createAccountService>;
    devices: DeviceService;
    pairing: ReturnType<typeof createPairingService>;
    captcha: ReturnType<typeof createCaptchaService>;
    recoveryBackup: BackupService;
    recovery: ReturnType<typeof createRecoveryService>;
    metrics: AuthMetrics;
  };
}

const sharedMetrics = new AuthMetrics();

const buildRepositories = async (config: Config) => {
  if (config.STORAGE_DRIVER === 'postgres') {
    await runMigrations(config);
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

const extendDeviceService = (service: ReturnType<typeof createDeviceService>, devices: DevicesRepo): DeviceService => ({
  ...service,
  revokeAllForAccount: async (accountId, exceptDeviceId) => {
    const deviceList = await devices.findByAccount(accountId);
    await Promise.all(
      deviceList.map((device) => {
        if (device.id === exceptDeviceId) {
          return devices.update(device.id, { status: 'active' });
        }
        if (device.status !== 'revoked') {
          return devices.update(device.id, { status: 'revoked' });
        }
        return Promise.resolve();
      })
    );
  }
});

const extendTokenService = (service: ReturnType<typeof createTokenService>): TokenService => ({
  ...service,
  revokeAllForAccount: async (tokensRepo, accountId) => {
    await tokensRepo.revokeAllForAccount(accountId);
  }
});

export const createContainer = async ({ config, logger }: { config: Config; logger: Logger }): Promise<Container> => {
  const repos = await buildRepositories(config);
  const tokenService = extendTokenService(createTokenService({ config, keyResolver: createKeyResolver(config) }));
  const accountService = createAccountService(repos.accounts);
  const deviceService = extendDeviceService(createDeviceService(repos.devices, config.DEVICE_MAX_PER_ACCOUNT), repos.devices);
  const nonceStore = config.REDIS_URL
    ? createRedisNonceStore(getRedisClient(config))
    : createMemoryNonceStore();
  const deviceAssertion = createDeviceAssertionService(nonceStore, 60_000);
  const pairingCache = config.REDIS_URL ? createRedisPairingStore(getRedisClient(config)) : undefined;
  const pairingService = createPairingService(repos.pairing, config.PAIRING_TOKEN_TTL_SECONDS, pairingCache);
  const captchaService = createCaptchaService(config, { metrics: sharedMetrics });
  const recoveryService = createRecoveryService(
    repos.recovery,
    {
      policy: {
        timeCost: config.ARGON2_TIME_COST,
        memoryCost: config.ARGON2_MEMORY_COST,
        parallelism: config.ARGON2_PARALLELISM,
        version: config.RECOVERY_CODE_VERSION
      },
      backup: {
        dummyCipherBytes: config.RECOVERY_BACKUP_DUMMY_CIPHER_BYTES,
        dummyNonceBytes: config.RECOVERY_BACKUP_DUMMY_NONCE_BYTES,
        dummySaltBytes: config.RECOVERY_BACKUP_DUMMY_SALT_BYTES,
        dummyAssociatedDataBytes: config.RECOVERY_BACKUP_DUMMY_AD_BYTES,
        dummyArgon: {
          timeCost: config.RECOVERY_BACKUP_ARGON_TIME_COST,
          memoryCost: config.RECOVERY_BACKUP_ARGON_MEMORY_COST,
          parallelism: config.RECOVERY_BACKUP_ARGON_PARALLELISM
        },
        minLatencyMs: config.RECOVERY_BACKUP_MIN_LATENCY_MS,
        argonFloor: {
          memoryDesktop: config.RECOVERY_ARGON_MIN_MEMORY_DESKTOP,
          memoryMobile: config.RECOVERY_ARGON_MIN_MEMORY_MOBILE,
          timeCost: config.RECOVERY_ARGON_MIN_TIME_COST,
          parallelism: config.RECOVERY_ARGON_MIN_PARALLELISM
        },
        retainBlobs: config.RECOVERY_BACKUP_RETAIN_BLOBS,
        kmsPepper: config.RECOVERY_KMS_PEPPER
          ? Buffer.from(config.RECOVERY_KMS_PEPPER, 'base64')
          : undefined
      },
      metrics: sharedMetrics
    },
    {
      revokeTokens: (accountId: string) => tokenService.revokeAllForAccount(repos.tokens, accountId),
      revokeDevices: (accountId: string, exceptDeviceId?: string) => deviceService.revokeAllForAccount(accountId, exceptDeviceId)
    }
  );

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
      captcha: captchaService,
      recoveryBackup: recoveryService.backup,
      recovery: recoveryService,
      metrics: sharedMetrics
    }
  };
};


