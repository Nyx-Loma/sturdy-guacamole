import { describe, expect, it } from 'vitest';
import { noopVerifier } from '../../../../domain/captcha/types';

describe('captcha types', () => {
  it('noop verifier allows by default', async () => {
    const result = await noopVerifier.verify({});
    expect(result).toEqual({ provider: 'none', verdict: 'allow' });
  });
});

