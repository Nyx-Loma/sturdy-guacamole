import { afterEach, beforeEach, vi } from 'vitest';

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

