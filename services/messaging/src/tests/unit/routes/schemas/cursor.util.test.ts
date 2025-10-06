import { describe, it, expect } from 'vitest';
import { parseCursor, encodeCursor } from '../../../../app/routes/schemas/cursor';

const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');

describe('cursor utils', () => {
  it('parseCursor returns undefined for empty inputs', () => {
    expect(parseCursor(undefined)).toBeUndefined();
    expect(parseCursor(null as unknown as string)).toBeUndefined();
    expect(parseCursor('')).toBeUndefined();
  });

  it('parseCursor returns payload for valid base64url JSON', () => {
    const payload = { before: '2024-01-01T00:00:00.000Z', after: undefined, token: 't1' };
    const str = b64(payload);
    expect(parseCursor(str)).toEqual(payload);
  });

  it('parseCursor returns undefined for invalid base64', () => {
    expect(parseCursor('not-base64')).toBeUndefined();
  });

  it('encodeCursor returns undefined when token missing', () => {
    expect(encodeCursor({ before: 'a' }, undefined)).toBeUndefined();
  });

  it('encodeCursor round-trips with parseCursor', () => {
    const query = { before: '2024-01-01T00:00:00.000Z', after: '2024-02-01T00:00:00.000Z' };
    const token = 'tok-123';
    const encoded = encodeCursor(query as any, token)!;
    const parsed = parseCursor(encoded)!;
    expect(parsed.before).toBe(query.before);
    expect(parsed.after).toBe(query.after);
    expect(parsed.token).toBe(token);
  });
});
