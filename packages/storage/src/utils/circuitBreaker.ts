export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold?: number;
  resetTimeoutMs: number;
}

type State = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: State = "closed";
  private failures = 0;
  private successes = 0;
  private nextAttempt = Date.now();

  constructor(private readonly options: CircuitBreakerOptions) {}

  isClosed(): boolean {
    return this.state === "closed";
  }

  isOpen(): boolean {
    return this.state === "open";
  }

  shouldAllow(): boolean {
    if (this.state === "open" && Date.now() > this.nextAttempt) {
      this.state = "half-open";
      return true;
    }
    return this.state !== "open";
  }

  recordSuccess(): void {
    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= (this.options.successThreshold ?? 1)) {
        this.reset();
      }
    } else {
      this.reset();
    }
  }

  recordFailure(): void {
    this.failures++;
    if (this.failures >= this.options.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = "open";
    this.nextAttempt = Date.now() + this.options.resetTimeoutMs;
  }

  private reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.state = "closed";
  }
}


