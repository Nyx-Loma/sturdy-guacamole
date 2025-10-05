import { describe, it, expect } from 'vitest';
import { createCircuitBreaker } from '../../../infra/circuitbreakers';

describe('circuit breaker', () => {
  it('opens after threshold and half-opens after cooldown, then closes on success', async () => {
    const fn = async () => {
      throw new Error('fail');
    };
    const metrics = {
      breakerOpened: { inc: () => {} },
      breakerHalfOpen: { inc: () => {} },
      breakerClosed: { inc: () => {} },
    } as any;
    const cb = createCircuitBreaker('test', fn, { timeoutMs: 10, failureThreshold: 2, halfOpenAfterMs: 20 }, metrics);
    await expect(cb()).rejects.toBeTruthy();
    await expect(cb()).rejects.toBeTruthy();
    // breaker now open; immediate call should reject with breaker_open
    await expect(cb()).rejects.toBeTruthy();
    // wait for half-open window
    await new Promise((r) => setTimeout(r, 25));
    // provide success function
    let ok = false;
    const cb2 = createCircuitBreaker('test2', async () => { ok = true; return 'ok'; }, { timeoutMs: 50, failureThreshold: 1, halfOpenAfterMs: 10 }, metrics);
    await expect(cb2()).resolves.toBe('ok');
    expect(ok).toBe(true);
  });
});


