import { createServer } from './server';
import { loadConfig, type Config } from '../config';
import { createLogger } from '../logging';
import { createContainer, type Container } from '../container';

interface BootstrapOverrides {
  config?: Config;
  services?: Partial<Container['services']>;
}

export const bootstrap = async (overrides: BootstrapOverrides = {}) => {
  const config = overrides.config ?? loadConfig();
  const logger = createLogger({ level: config.LOG_LEVEL });
  const container = await createContainer({ config, logger });

  if (overrides.services) {
    Object.assign(container.services, overrides.services);
  }

  const server = await createServer({ config, logger, container });
  return { server, config, logger, container };
};


