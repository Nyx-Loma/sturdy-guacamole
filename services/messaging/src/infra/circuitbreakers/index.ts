export type BreakerState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  timeoutMs: number;
  failureThreshold: number; // consecutive failures to open
  halfOpenAfterMs: number;  // cool-down before a trial
}

interface MetricsLike {
  breakerOpened?: { inc: (labels?: Record<string, unknown>) => void };
  breakerHalfOpen?: { inc: (labels?: Record<string, unknown>) => void };
  breakerClosed?: { inc: (labels?: Record<string, unknown>) => void };
}

/**
 * Lightweight circuit breaker wrapper for async operations.
 * Does not cancel underlying IO; enforces an outer timeout and tracks failures.
 */
export class CircuitBreaker<TArgs extends unknown[], TResult> {
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly name: string,
    private readonly handler: (...args: TArgs) => Promise<TResult>,
    private readonly options: CircuitBreakerOptions,
    private readonly metrics?: MetricsLike,
  ) {}

  getState(): BreakerState { return this.state; }

  async exec(...args: TArgs): Promise<TResult> {
    const now = Date.now();
    if (this.state === 'open') {
      if (now - this.openedAt < this.options.halfOpenAfterMs) {
        throw this.wrapError(new Error(`${this.name}: breaker open`), 'breaker_open');
      }
      this.state = 'half_open';
      this.metrics?.breakerHalfOpen?.inc?.({ name: this.name });
    }

    try {
      const result = await this.withTimeout(this.handler(...args), this.options.timeoutMs);
      // success path
      this.failures = 0;
      if (this.state !== 'closed') {
        this.state = 'closed';
        this.metrics?.breakerClosed?.inc?.({ name: this.name });
      }
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.options.failureThreshold) {
        this.state = 'open';
        this.openedAt = now;
        this.metrics?.breakerOpened?.inc?.({ name: this.name });
      }
      throw this.wrapError(err as Error, 'operation_failed');
    }
  }

  private async withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(this.wrapError(new Error(`${this.name}: timeout`), 'timeout')), timeoutMs);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  private wrapError(err: Error, code: string): Error {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).code = (err as any).code ?? code;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).breaker = this.name;
    return err;
  }
}

export function createCircuitBreaker<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>,
  options: CircuitBreakerOptions,
  metrics?: MetricsLike,
) {
  const breaker = new CircuitBreaker<TArgs, TResult>(name, fn, options, metrics);
  return (...args: TArgs) => breaker.exec(...args);
}


