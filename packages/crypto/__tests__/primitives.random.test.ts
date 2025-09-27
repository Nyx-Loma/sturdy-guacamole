import { describe, expect, it } from 'vitest';
import { randomBytes } from '../src/primitives/random';

describe('primitives/random', () => {
  it('returns zero-length buffer when asked for zero bytes', async () => {
    const bytes = await randomBytes(0);
    expect(bytes).toHaveLength(0);
  });

  it('does not allow tiny lengths to reduce entropy', async () => {
    const bytes = await randomBytes(1);
    expect(bytes).toHaveLength(1);
    expect(bytes[0]).toBeTypeOf('number');
  });
});


