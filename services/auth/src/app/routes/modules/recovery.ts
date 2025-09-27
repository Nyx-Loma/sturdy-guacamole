import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container';
import { RecoveryPolicyError, RecoveryValidationError } from '../../../domain/errors';

const accountId = z.string().uuid();

const ArgonParamsSchema = z.object({
  time_cost: z.number().int().positive(),
  memory_cost: z.number().int().positive(),
  parallelism: z.number().int().positive(),
  profile: z.enum(['desktop', 'mobile'])
});

const SubmitSchema = z.object({
  account_id: accountId,
  blob_version: z.number().int().nonnegative(),
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
  associated_data: z.string().min(1),
  salt: z.string().min(1),
  argon: ArgonParamsSchema,
  cipher_length: z.number().int().nonnegative(),
  pad_length: z.number().int().nonnegative(),
  verifier: z.string().optional(),
  ciphertext_mac: z.string().optional(),
  previous_blob_id: z.string().uuid().optional()
});

const PrepareSchema = z.object({
  account_id: accountId.optional()
});

const StatusSchema = z.object({
  account_id: accountId
});

const RestoreSchema = z.object({
  account_id: accountId,
  mrc: z.string().min(8),
  keep_device_id: z.string().uuid().optional()
});

const AuditSchema = z.object({
  account_id: accountId
});

export const recoveryRoutes = async (app: FastifyInstance, { container }: { container: Container }) => {
  const { recovery, recoveryBackup, metrics } = container.services;

  app.post('/v1/recovery/backup/prepare', async (request, reply) => {
    const body = PrepareSchema.parse(request.body ?? {});
    const accountIdValue = body.account_id ?? null;
    try {
      const result = await recoveryBackup.prepare(accountIdValue);
      return reply.status(200).send({
        payload: {
          blob_version: result.payload.blobVersion,
          ciphertext: Buffer.from(result.payload.ciphertext).toString('base64url'),
          nonce: Buffer.from(result.payload.nonce).toString('base64url'),
          associated_data: Buffer.from(result.payload.associatedData).toString('base64url'),
          salt: Buffer.from(result.payload.salt).toString('base64url'),
          argon: {
            time_cost: result.payload.argonParams.timeCost,
            memory_cost: result.payload.argonParams.memoryCost,
            parallelism: result.payload.argonParams.parallelism
          },
          cipher_length: result.payload.cipherLength,
          pad_length: result.payload.padLength,
          latency_floor_ms: result.payload.latencyFloorMs
        },
        metadata: {
          blob_id: result.blobId,
          created_at: result.createdAt?.toISOString(),
          is_dummy: result.isDummy,
          size_bytes: result.sizeBytes,
          verifier: result.verifier
        }
      });
    } catch (error) {
      metrics.recordBackup('prepare', 'fail');
      if (error instanceof RecoveryValidationError) {
        return reply.status(400).send({ error: error.code, message: error.message });
      }
      return reply.status(503).send({ error: 'BACKUP_PREPARE_FAILED' });
    }
  });

  app.post('/v1/recovery/backup/submit', async (request, reply) => {
    const body = SubmitSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ error: 'validation_error', issues: body.error.issues });
    }
    const decode = (value: string) => Buffer.from(value, 'base64url');
    try {
      const blobId = await recoveryBackup.createBackup({
        accountId: body.data.account_id,
        blobVersion: body.data.blob_version,
        ciphertext: decode(body.data.ciphertext),
        nonce: decode(body.data.nonce),
        associatedData: decode(body.data.associated_data),
        salt: decode(body.data.salt),
        argonParams: {
          timeCost: body.data.argon.time_cost,
          memoryCost: body.data.argon.memory_cost,
          parallelism: body.data.argon.parallelism
        },
        profile: body.data.argon.profile,
        cipherLength: body.data.cipher_length,
        padLength: body.data.pad_length,
        previousBlobId: body.data.previous_blob_id ?? null
      });
      return reply.status(201).send({ blob_id: blobId });
    } catch (error) {
      metrics.recordBackup('submit', 'fail');
      if (error instanceof RecoveryPolicyError) {
        return reply.status(422).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  });

  app.get('/v1/recovery/backup/status', async (request, reply) => {
    const query = StatusSchema.parse(request.query);
    try {
      const status = await recoveryBackup.getStatus(query.account_id);
      return reply.status(200).send(status);
    } catch {
      metrics.recordBackup('status', 'fail');
      return reply.status(503).send({ error: 'STATUS_UNAVAILABLE' });
    }
  });

  app.post('/v1/recovery/backup/restore', async (request, reply) => {
    const parsed = RestoreSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    const body = parsed.data;
    const started = Date.now();
    try {
      const result = await recovery.restore(body.account_id, Buffer.from(body.mrc, 'utf8'), {
        keepDeviceId: body.keep_device_id
      });
      metrics.observeBackupLatency('restore', Date.now() - started);
      return reply.status(200).send({
        account_id: result.accountId,
        blob_version: result.blobVersion,
        profile: result.profile,
        argon: result.argonParams,
        payload: Buffer.from(result.payload).toString('base64url')
      });
    } catch (error) {
      metrics.recordBackup('status', 'fail');
      metrics.observeBackupLatency('restore', Date.now() - started);
      if (error instanceof RecoveryValidationError) {
        return reply.status(400).send({ error: error.code, message: error.message });
      }
      return reply.status(503).send({ error: 'RESTORE_FAILED' });
    }
  });

  app.get('/v1/recovery/backup/audit', async (request, reply) => {
    const query = AuditSchema.parse(request.query);
    const result = await recovery.audit(query.account_id);
    return reply.status(200).send(result);
  });

  app.post('/v1/recovery/setup', async (_request, reply) => {
    reply.status(501).send({ error: 'NOT_IMPLEMENTED', message: 'recovery setup pending' });
  });
};


