import Redis from 'ioredis';
import type { Config } from '../../config';

let client: Redis | undefined;

export const getRedisClient = (config: Config) => {
  if (!config.REDIS_URL) {
    throw new Error('REDIS_URL is not configured');
  }
  if (!client) {
    client = new Redis(config.REDIS_URL, {
      lazyConnect: true
    });
  }
  return client;
};

export const closeRedisClient = async () => {
  if (client) {
    await client.quit();
    client = undefined;
  }
};

