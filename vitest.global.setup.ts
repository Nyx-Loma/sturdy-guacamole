import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import sodium from 'libsodium-wrappers';

process.env.STORAGE_DRIVER ??= 'memory';
process.env.RATE_LIMIT_DISABLED ??= 'true';
process.env.DATABASE_URL ??= 'postgresql://messaging:messaging@localhost:5433/messaging';

const RNG_MODULUS = 2147483647;
const RNG_MULTIPLIER = 16807;

const createSeededRandom = () => {
  let seed = 1337;
  return () => {
    seed = (seed * RNG_MULTIPLIER) % RNG_MODULUS;
    return seed / RNG_MODULUS;
  };
};

beforeAll(async () => {
  await sodium.ready;
});

beforeEach(() => {
  const randomFn = createSeededRandom();
  vi.spyOn(Math, 'random').mockImplementation(randomFn);
});

afterEach(() => {
  vi.restoreAllMocks();
});

