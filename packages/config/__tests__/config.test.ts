import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/index';

describe('config loader', () => {
  it('throws when required vars are missing', () => {
    expect(() => loadConfig({})).toThrow(/Invalid configuration/);
  });
});

