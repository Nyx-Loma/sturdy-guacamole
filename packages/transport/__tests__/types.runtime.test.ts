import { describe, expect, it } from 'vitest';
import * as Types from '../src/types';

describe('transport types runtime coverage', () => {
  it('AckMessage shape allows accepted and rejected statuses', () => {
    const accepted: Types.AckMessage = { type: 'ack', id: 'a', status: 'accepted', seq: 1 };
    const rejected: Types.AckMessage = { type: 'ack', id: 'b', status: 'rejected', reason: 'duplicate' };
    expect(accepted.status).toBe('accepted');
    expect(rejected.reason).toBe('duplicate');
  });

  it('MetricsEvent includes replay fields', () => {
    const event: Types.MetricsEvent = {
      type: 'ws_replay_complete',
      replayCount: 10,
      batches: 2
    };
    expect(event.replayCount).toBe(10);
    expect(event.batches).toBe(2);
  });

  it('WebSocketHubOptions requires authenticate and stores hooks', () => {
    const opts: Pick<Types.WebSocketHubOptions, 'authenticate' | 'loadResumeState' | 'persistResumeState' | 'dropResumeState'> = {
      authenticate: async () => ({ accountId: 'a', deviceId: 'd' }),
      loadResumeState: async () => null,
      persistResumeState: async () => undefined,
      dropResumeState: async () => undefined
    };
    expect(opts.authenticate).toBeInstanceOf(Function);
  });
});
