import { describe, it, expect, vi } from 'vitest';
import { createDispatcherRunner } from '../../../app/stream/runLoop';

const makeConfig = (enabled: boolean) => ({ DISPATCHER_ENABLED: enabled, DISPATCH_TICK_MS: 1 }) as any;

describe('dispatcher runLoop branches', () => {
  it('does nothing when disabled', async () => {
    const dispatcher = { tick: vi.fn() } as any;
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const runner = createDispatcherRunner(dispatcher, makeConfig(false), logger);
    await runner.start();
    expect(dispatcher.tick).not.toHaveBeenCalled();
  });

  it('warns when already running', async () => {
    const dispatcher = { tick: vi.fn().mockResolvedValue(undefined) } as any;
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const runner = createDispatcherRunner(dispatcher, makeConfig(true), logger);
    await runner.start();
    await runner.start();
    expect(logger.warn).toHaveBeenCalled();
    await runner.stop();
  });

  it('loops tick on success', async () => {
    const dispatcher = { tick: vi.fn().mockResolvedValue(undefined) } as any;
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const runner = createDispatcherRunner(dispatcher, makeConfig(true), logger);
    await runner.start();
    await new Promise((r) => setTimeout(r, 3));
    await runner.stop();
    expect(dispatcher.tick).toHaveBeenCalled();
  });

  it('logs error when tick throws', async () => {
    const dispatcher = { tick: vi.fn().mockRejectedValue(new Error('boom')) } as any;
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const runner = createDispatcherRunner(dispatcher, makeConfig(true), logger);
    await runner.start();
    await new Promise((r) => setTimeout(r, 3));
    await runner.stop();
    expect(logger.error).toHaveBeenCalled();
  });

  it('stop during running awaits loop completion', async () => {
    const dispatcher = { tick: vi.fn().mockResolvedValue(undefined) } as any;
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const runner = createDispatcherRunner(dispatcher, makeConfig(true), logger);
    await runner.start();
    await runner.stop();
    expect(logger.info).toHaveBeenCalledWith('dispatcher stopped');
  });
});
