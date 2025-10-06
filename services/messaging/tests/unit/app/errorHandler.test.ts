import { describe, it, expect, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { registerErrorHandler } from '../../../src/app/errorHandler';
import { MessagingError } from '../../../src/domain/errors';

function createAppMock(): FastifyInstance {
  // minimal mock for setErrorHandler
   
  return {
    setErrorHandler: vi.fn()
  } as any;
}

describe('registerErrorHandler', () => {
  it('maps MessagingError to its status code and code', async () => {
    const app = createAppMock();
    registerErrorHandler(app);

    const [[handler]] = (app.setErrorHandler as unknown as { mock: { calls: any[][] } }).mock.calls;

    const reply = {
      code: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn()
    };

    class MyError extends MessagingError {
      constructor() {
        super('boom', 'CUSTOM', 418);
      }
    }

    await handler(new MyError(), { id: 'req1', log: { error: vi.fn(), warn: vi.fn() } }, reply);
    expect(reply.code).toHaveBeenCalledWith(418);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ code: 'CUSTOM', requestId: 'req1' }));
  });

  it('returns 400 on zod validation error', async () => {
    const app = createAppMock();
    registerErrorHandler(app);
    const [[handler]] = (app.setErrorHandler as unknown as { mock: { calls: any[][] } }).mock.calls;
    const reply = { code: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), send: vi.fn() };
    // Create a real ZodError via parse
    const schema = (await import('zod')).z.object({ id: (await import('zod')).z.string().uuid() });
    let zodErr: unknown;
    try {
      schema.parse({ id: 'not-a-uuid' });
    } catch (e) {
      zodErr = e;
    }
    await handler(zodErr, { id: 'id2', log: { error: vi.fn(), warn: vi.fn() } }, reply);
    expect(reply.code).toHaveBeenCalledWith(400);
  });

  it('logs server errors at error level', async () => {
    const app = createAppMock();
    registerErrorHandler(app);
    const [[handler]] = (app.setErrorHandler as unknown as { mock: { calls: any[][] } }).mock.calls;
    const errorLog = vi.fn();
    const warnLog = vi.fn();
    const reply = { code: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), send: vi.fn() };
    await handler(new Error('fatal'), { id: 'id3', log: { error: errorLog, warn: warnLog } }, reply);
    expect(errorLog).toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
    expect(reply.code).toHaveBeenCalledWith(500);
  });
});


