import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { loadConfig } from '../../../config/index.js';
import { createDirectoryService } from '../../../services/directoryService.js';

const accountIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase())
});

const hashedEmailQuerySchema = z.object({
  email: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'email must be a sha256 hex string')
    .transform((value) => value.toLowerCase())
});

type DirectoryEntryResult = Awaited<ReturnType<ReturnType<typeof createDirectoryService>['findByAccountId']>>;

const convertEntry = (entry: DirectoryEntryResult) =>
  entry
    ? {
        account_id: entry.accountId,
        display_name: entry.displayName,
        public_key: entry.publicKey,
        device_count: entry.deviceCount,
        updated_at: entry.updatedAt.toISOString()
      }
    : null;

const hashEmail = (email: string, salt?: string) => {
  const normalized = email.trim().toLowerCase();
  const input = salt ? `${salt}:${normalized}` : normalized;
  return createHash('sha256').update(input).digest('hex');
};

export const registerDirectoryRoutes = async (app: FastifyInstance) => {
  app.get<{ Params: { id: string } }>('/accounts/:id', {
    schema: {
      description: 'Look up user directory entry by account ID',
      tags: ['directory'],
      security: [{ apiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Account UUID' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            account_id: { type: 'string', format: 'uuid' },
            display_name: { type: 'string' },
            public_key: { type: 'string' },
            device_count: { type: 'number' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const params = accountIdParamSchema.parse(request.params);
    const entry = await app.directoryService.findByAccountId(params.id);
    if (!entry) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'account not found' });
    }
    return reply.send(convertEntry(entry));
  });

  app.get('/accounts', {
    schema: {
      description: 'Look up user by hashed email (privacy-preserving discovery)',
      tags: ['directory'],
      security: [{ apiKeyAuth: [] }],
      querystring: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'SHA-256 hash of email (hex)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            account_id: { type: 'string', format: 'uuid' },
            display_name: { type: 'string' },
            public_key: { type: 'string' },
            device_count: { type: 'number' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { email?: string } }>, reply) => {
    const config = loadConfig();
    if (!config.HASHED_EMAIL_LOOKUP_ENABLED) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'hashed email lookup disabled' });
    }

    const { email } = hashedEmailQuerySchema.parse(request.query);
    const entry = await app.directoryService.findByHashedEmail(email);
    if (!entry) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'account not found' });
    }
    return reply.send(convertEntry(entry));
  });

  app.post<{ Body: { email: string } }>('/accounts/hash', {
    schema: {
      description: 'Hash an email for privacy-preserving lookup',
      tags: ['directory'],
      security: [{ apiKeyAuth: [] }],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email', description: 'Email address to hash' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            hashed_email: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'SHA-256 hash (hex)' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const config = loadConfig();
    if (!config.HASHED_EMAIL_LOOKUP_ENABLED) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'hashed email lookup disabled' });
    }
    const bodySchema = z.object({
      email: z.string().email()
    });
    const { email } = bodySchema.parse(request.body);
    const hashed = hashEmail(email, config.HASHED_EMAIL_SALT);
    return reply.send({ hashed_email: hashed });
  });
};


