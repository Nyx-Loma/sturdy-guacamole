import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrap } from '../../app/bootstrap';
import * as configModule from '../../config';
import * as containerModule from '../../container';
import * as serverModule from '../../app/server';

describe('auth bootstrap', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs config, container, and server', async () => {
    const config = { LOG_LEVEL: 'error' } as any;
    const container = { services: {}, repos: {}, config } as any;
    const server = { listen: vi.fn(), close: vi.fn(), app: {} } as any;

    const loadConfigSpy = vi.spyOn(configModule, 'loadConfig').mockReturnValue(config);
    const createContainerSpy = vi.spyOn(containerModule, 'createContainer').mockResolvedValue(container);
    const createServerSpy = vi.spyOn(serverModule, 'createServer').mockResolvedValue(server);

    const result = await bootstrap();

    expect(loadConfigSpy).toHaveBeenCalledOnce();
    expect(createContainerSpy).toHaveBeenCalledWith({ config, logger: expect.anything() });
    expect(createServerSpy).toHaveBeenCalledWith({ config, logger: expect.anything(), container });
    expect(result.server).toBe(server);
  });

  it('applies service overrides', async () => {
    const config = { LOG_LEVEL: 'error' } as any;
    const container = { services: { captcha: { verify: vi.fn() } }, repos: {}, config } as any;
    const server = { listen: vi.fn(), close: vi.fn(), app: {} } as any;

    vi.spyOn(configModule, 'loadConfig').mockReturnValue(config);
    vi.spyOn(containerModule, 'createContainer').mockResolvedValue(container);
    vi.spyOn(serverModule, 'createServer').mockResolvedValue(server);

    const overrides = { services: { captcha: { verify: vi.fn() } } };
    await bootstrap(overrides);

    expect(container.services.captcha.verify).toBe(overrides.services.captcha.verify);
  });

  it('propagates container creation failures', async () => {
    const config = { LOG_LEVEL: 'error' } as any;
    vi.spyOn(configModule, 'loadConfig').mockReturnValue(config);
    vi.spyOn(containerModule, 'createContainer').mockRejectedValue(new Error('container boom'));

    await expect(bootstrap()).rejects.toThrow('container boom');
  });
});


