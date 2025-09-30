import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, resetConfig } from '@sanctum/config';
import { createServer } from '../src/bootstrap';
import { WebSocket } from 'ws';

const BASE_ENV = {
  DATABASE_URL: 'postgres://test:test@localhost:5432/test-db',
  REDIS_URL: 'redis://localhost:6379',
  REDIS_QUEUE_URL: 'redis://localhost:6379',
  KMS_KEY_ID: 'kms-test',
  CAPTCHA_SITE_KEY: 'captcha-site-test',
  CAPTCHA_SECRET_KEY: 'captcha-secret-test',
  AWS_REGION: 'us-east-1',
  QUEUE_STREAM_KEY: 'stream',
  QUEUE_GROUP: 'group',
  QUEUE_CONSUMER_NAME: 'consumer',
  WS_DEV_TOKEN: 'test-token',
  QUEUE_ENABLED: 'false'
} satisfies Record<string, string>;

describe('server bootstrap', () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(BASE_ENV)) {
      process.env[key] = value;
    }
    resetConfig();
  });

  it('responds to health checks and echoes websocket messages', async () => {
    const host = '127.0.0.1';
    const port = 4000 + Math.floor(Math.random() * 1000);

    process.env.SERVER_HOST = host;
    process.env.SERVER_PORT = String(port);
    process.env.WS_DEV_TOKEN = 'dev-token';
    process.env.QUEUE_STREAM_KEY = 'test-stream';
    process.env.QUEUE_GROUP = 'test-group';
    process.env.QUEUE_CONSUMER_NAME = 'test-consumer';
    process.env.QUEUE_ENABLED = 'false';
    resetConfig();

    const config = loadConfig();

    const redisQuit = vi.fn().mockResolvedValue(undefined);

    const redisStub = {
      quit: redisQuit,
      on: vi.fn(),
      duplicate: vi.fn().mockReturnValue({ quit: redisQuit, on: vi.fn() })
    } as const;

    const { listen, close } = await createServer(config, {
      redisFactory: () => redisStub as any
    });
    await listen();

    try {
      const response = await fetch(`http://${host}:${port}/health`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ status: 'ok' });

      const socket = new WebSocket(`ws://${host}:${port}/ws`, {
        headers: {
          Authorization: 'Bearer dev-token'
        }
      });

      const acknowledgement = await new Promise<Record<string, unknown>>((resolve, reject) => {
        socket.once('message', (data) => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
      });

      expect(acknowledgement).toMatchObject({ type: 'connection_ack' });
      expect(typeof acknowledgement.resumeToken).toBe('string');

      const ack = await new Promise<Record<string, unknown>>((resolve, reject) => {
        socket.once('message', (data) => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
        socket.send(
          JSON.stringify({
            v: 1,
            id: '9d7b1b5c-5e15-4b92-a2e2-7f0d6ffd1fd1',
            type: 'msg',
            payload: { seq: 0 },
            size: 42
          })
        );
      });

      expect(ack).toEqual({
        type: 'ack',
        id: '9d7b1b5c-5e15-4b92-a2e2-7f0d6ffd1fd1',
        status: 'accepted',
        seq: 1
      });

      socket.send('invalid');

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('close timeout')), 1000);
        socket.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.once('error', reject);
      });

      socket.close();
    } finally {
      await close();
    }
  });
});

