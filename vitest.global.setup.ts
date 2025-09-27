import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import sodium from 'libsodium-wrappers';

const BASE_DATE = new Date('2025-01-01T00:00:00.000Z');
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
  vi.stubGlobal('Math', { ...Math, random: randomFn });
  vi.useFakeTimers();
  vi.setSystemTime(BASE_DATE);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

