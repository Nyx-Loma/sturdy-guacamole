export interface BackpressureMetrics {
  wsQueueDepth?: { set: (value: number) => void };
  wsDroppedTotal?: { inc: (labels?: Record<string, unknown>) => void };
}

export interface BackpressureOptions {
  maxQueue: number;            // max buffered messages per socket
  dropPolicy: 'drop_new' | 'drop_old';
  metrics?: BackpressureMetrics;
}

export class BoundedQueue<T> {
  private readonly queue: T[] = [];
  constructor(private readonly opts: BackpressureOptions) {}

  size(): number { return this.queue.length; }

  push(item: T): boolean {
    if (this.queue.length < this.opts.maxQueue) {
      this.queue.push(item);
      this.opts.metrics?.wsQueueDepth?.set?.(this.queue.length);
      return true;
    }
    // overflow
    if (this.opts.dropPolicy === 'drop_new') {
      this.opts.metrics?.wsDroppedTotal?.inc?.({ reason: 'new' });
      return false;
    } else {
      // drop oldest, enqueue new
      this.queue.shift();
      this.queue.push(item);
      this.opts.metrics?.wsDroppedTotal?.inc?.({ reason: 'old' });
      this.opts.metrics?.wsQueueDepth?.set?.(this.queue.length);
      return true;
    }
  }

  drain(sender: (item: T) => boolean): void {
    // Attempt to send until sender backpressure says stop
    while (this.queue.length > 0) {
      const next = this.queue[0];
      const ok = sender(next);
      if (!ok) break;
      this.queue.shift();
      this.opts.metrics?.wsQueueDepth?.set?.(this.queue.length);
    }
  }
}


