import { describe, expect, it, vi } from 'vitest';
import { hashToken, redactToken, logWithContext, sanitizeError } from '../src/logging';

describe('logging helpers', () => {
  it('redacts tokens without leaking raw value', () => {
    const redacted = redactToken('super-secret-token');
    expect(redacted).toMatch(/^\*\*\*[0-9a-f]{8}$/i);
    expect(redacted).not.toContain('super-secret-token');
  });

  it('produces stable hash prefix', () => {
    const first = hashToken('foo');
    const second = hashToken('foo');
    expect(first).toHaveLength(8);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]+$/i);
  });

  it('logs with context when logger has matching method', () => {
    const logger = { info: vi.fn() };
    const context = { clientId: 'client-1' };

    logWithContext(logger, 'info', 'test_message', context);

    expect(logger.info).toHaveBeenCalledWith(context, 'test_message');
  });

  it('safely handles missing logger method', () => {
    expect(() => logWithContext({}, 'debug', 'noop')).not.toThrow();
  });

  it('sanitizes errors', () => {
    const err = new Error('boom');
    expect(sanitizeError(err)).toEqual({ name: 'Error', message: 'boom' });
    expect(sanitizeError('oops')).toEqual({ message: 'oops' });
    expect(sanitizeError(123)).toEqual({ message: 'unknown' });
  });
});

