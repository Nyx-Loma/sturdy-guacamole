import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';

const mockCreateInMemoryAccountsRepository = vi.fn(() => ({ __type: 'memory-accounts' }));
const mockCreateInMemoryDevicesRepository = vi.fn(() => ({
  __type: 'memory-devices',
  findByAccount: vi.fn().mockResolvedValue([]),
  update: vi.fn()
}));
const mockCreateInMemoryTokensRepository = vi.fn(() => ({ __type: 'memory-tokens', revokeAllForAccount: vi.fn() }));
const mockCreateInMemoryPairingRepository = vi.fn(() => ({ __type: 'memory-pairing' }));
const mockCreateInMemoryRecoveryRepository = vi.fn(() => ({ __type: 'memory-recovery' }));

const mockCreatePostgresAccountsRepository = vi.fn(() => ({ __type: 'pg-accounts' }));
const mockCreatePostgresDevicesRepository = vi.fn(() => ({
  __type: 'pg-devices',
  findByAccount: vi.fn().mockResolvedValue([]),
  update: vi.fn()
}));
const mockCreatePostgresTokensRepository = vi.fn(() => ({ __type: 'pg-tokens', revokeAllForAccount: vi.fn() }));
const mockCreatePostgresPairingRepository = vi.fn(() => ({ __type: 'pg-pairing' }));
const mockCreatePostgresRecoveryRepository = vi.fn(() => ({ __type: 'pg-recovery' }));

const mockCreateTokenService = vi.fn(() => ({ name: 'token-service' }));
const mockCreateDeviceAssertionService = vi.fn(() => ({ name: 'device-assertion' }));
const mockCreateAccountService = vi.fn(() => ({ name: 'account-service' }));
const mockCreateDeviceService = vi.fn(() => ({ name: 'device-service' }));
const mockCreatePairingService = vi.fn(() => ({ name: 'pairing-service' }));
const mockCreateCaptchaService = vi.fn(() => ({ name: 'captcha-service' }));
const mockCreateRecoveryService = vi.fn(() => ({ name: 'recovery-service', backup: { __type: 'mock-backup' } }));

const mockCreateMemoryNonceStore = vi.fn(() => ({ __type: 'memory-nonce-store' }));
const mockCreateRedisNonceStore = vi.fn(() => ({ __type: 'redis-nonce-store' }));
const mockCreateRedisPairingStore = vi.fn(() => ({ __type: 'redis-pairing-store' }));
const mockGetRedisClient = vi.fn(() => ({ __type: 'redis-client' }));

const mockGetPool = vi.fn(() => ({ __type: 'pg-pool' }));
const mockCreateKeyResolver = vi.fn(() => ({ __type: 'key-resolver' }));

vi.mock('../../adapters/inMemory/accountsRepository', () => ({ createInMemoryAccountsRepository: mockCreateInMemoryAccountsRepository }));
vi.mock('../../adapters/inMemory/devicesRepository', () => ({ createInMemoryDevicesRepository: mockCreateInMemoryDevicesRepository }));
vi.mock('../../adapters/inMemory/tokensRepository', () => ({ createInMemoryTokensRepository: mockCreateInMemoryTokensRepository }));
vi.mock('../../adapters/inMemory/pairingRepository', () => ({ createInMemoryPairingRepository: mockCreateInMemoryPairingRepository }));
vi.mock('../../adapters/inMemory/recoveryRepository', () => ({ createInMemoryRecoveryRepository: mockCreateInMemoryRecoveryRepository }));

vi.mock('../../adapters/postgres', () => ({
  createPostgresAccountsRepository: mockCreatePostgresAccountsRepository,
  createPostgresDevicesRepository: mockCreatePostgresDevicesRepository,
  createPostgresTokensRepository: mockCreatePostgresTokensRepository,
  createPostgresPairingRepository: mockCreatePostgresPairingRepository,
  createPostgresRecoveryRepository: mockCreatePostgresRecoveryRepository,
  getPool: mockGetPool
}));

vi.mock('../../adapters/postgres/migrate', () => ({ runMigrations: vi.fn() }));

vi.mock('../../domain/services/tokenService', () => ({ createTokenService: mockCreateTokenService }));
vi.mock('../../domain/services/deviceAssertion', () => ({ createDeviceAssertionService: mockCreateDeviceAssertionService }));
vi.mock('../../domain/services/accountService', () => ({ createAccountService: mockCreateAccountService }));
vi.mock('../../domain/services/deviceService', () => ({ createDeviceService: mockCreateDeviceService }));
vi.mock('../../domain/services/pairingService', () => ({ createPairingService: mockCreatePairingService }));
vi.mock('../../domain/services/recoveryService', () => ({ createRecoveryService: mockCreateRecoveryService }));
vi.mock('../../domain/captcha/service', () => ({ createCaptchaService: mockCreateCaptchaService }));
vi.mock('../../domain/keys', () => ({ createKeyResolver: mockCreateKeyResolver }));

vi.mock('../../adapters/memoryNonceStore', () => ({ createMemoryNonceStore: mockCreateMemoryNonceStore }));
vi.mock('../../adapters/redis', () => ({
  createRedisNonceStore: mockCreateRedisNonceStore,
  createRedisPairingStore: mockCreateRedisPairingStore,
  getRedisClient: mockGetRedisClient
}));

const originalEnv = { ...process.env };

const loadModules = async () => {
  const configModule = await import('../../config');
  const containerModule = await import('../../container');
  return { ...configModule, createContainer: containerModule.createContainer };
};

beforeEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
  vi.resetModules();
});

afterAll(() => {
  process.env = originalEnv;
});

describe('container composition', () => {
  it('uses in-memory adapters by default', async () => {
    process.env.STORAGE_DRIVER = 'memory';
    delete process.env.REDIS_URL; // Ensure Redis is not used in memory mode
    delete process.env.POSTGRES_URL; // Ensure Postgres is not used in memory mode
    const { loadConfig, resetConfigForTests, createContainer } = await loadModules();
    resetConfigForTests();
    const config = loadConfig();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    const container = await createContainer({ config, logger });

    expect(mockCreateInMemoryAccountsRepository).toHaveBeenCalledOnce();
    expect(mockCreatePostgresAccountsRepository).not.toHaveBeenCalled();
    expect(container.repos.accounts.__type).toBe('memory-accounts');
    expect(container.repos.tokens.__type).toBe('memory-tokens');
    expect(container.services.recoveryBackup).toEqual({ __type: 'mock-backup' });
    expect(mockCreateMemoryNonceStore).toHaveBeenCalledOnce();
    expect(mockCreateRedisNonceStore).not.toHaveBeenCalled();
  });

  it('uses postgres adapters and redis stores when configured', async () => {
    process.env.STORAGE_DRIVER = 'postgres';
    process.env.POSTGRES_URL = 'postgres://postgres:postgres@localhost:55432/auth';
    process.env.REDIS_URL = 'redis://localhost:6379';

    const { loadConfig, resetConfigForTests, createContainer } = await loadModules();
    resetConfigForTests();
    const config = loadConfig();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    const container = await createContainer({ config, logger });

    expect(mockGetPool).toHaveBeenCalledWith(config);
    expect(mockCreatePostgresAccountsRepository).toHaveBeenCalledOnce();
    expect(container.repos.accounts.__type).toBe('pg-accounts');
    expect(mockCreateRedisNonceStore).toHaveBeenCalledWith({ __type: 'redis-client' });
    expect(mockCreateRedisPairingStore).toHaveBeenCalledWith({ __type: 'redis-client' });
    expect(mockCreateMemoryNonceStore).not.toHaveBeenCalled();
    expect(container.services.recoveryBackup).toEqual({ __type: 'mock-backup' });
  });
});
