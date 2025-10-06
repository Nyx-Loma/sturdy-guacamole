import { describe, it, expect } from 'vitest';
import { BoundedQueue } from '../../../ws/backpressure';

describe('BoundedQueue', () => {
  it('enqueues up to max and drops old when drop_old', () => {
    const metrics = { wsQueueDepth: { set: () => {} }, wsDroppedTotal: { inc: () => {} } } as any;
    const q = new BoundedQueue<number>({ maxQueue: 2, dropPolicy: 'drop_old', metrics });
    expect(q.push(1)).toBe(true);
    expect(q.push(2)).toBe(true);
    expect(q.size()).toBe(2);
    // third push drops oldest
    expect(q.push(3)).toBe(true);
    const drained: number[] = [];
    q.drain((x) => { drained.push(x); return true; });
    expect(drained).toEqual([2,3]);
  });

  it('drops new when drop_new and over capacity', () => {
    const metrics = { wsQueueDepth: { set: () => {} }, wsDroppedTotal: { inc: () => {} } } as any;
    const q = new BoundedQueue<number>({ maxQueue: 1, dropPolicy: 'drop_new', metrics });
    expect(q.push(1)).toBe(true);
    expect(q.push(2)).toBe(false);
    const drained: number[] = [];
    q.drain((x) => { drained.push(x); return true; });
    expect(drained).toEqual([1]);
  });
});


