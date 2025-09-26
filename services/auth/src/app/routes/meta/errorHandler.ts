import type { FastifyInstance } from 'fastify';
import {
  RateLimitError,
  InvalidSignatureError,
  ExpiredPairingError,
  NotFoundError,
  AuthError,
  CaptchaRequiredError,
  ExpiredTokenError
} from '../../../domain/errors';

export const registerErrorHandler = (app: FastifyInstance) => {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof RateLimitError) {
      return reply.status(429).send({ error: error.code, message: error.message });
    }
    if (error instanceof InvalidSignatureError) {
      return reply.status(401).send({ error: error.code, message: error.message });
    }
    if (error instanceof ExpiredPairingError) {
      return reply.status(410).send({ error: error.code, message: error.message });
    }
    if (error instanceof ExpiredTokenError) {
      return reply.status(401).send({ error: error.code, message: error.message });
    }
    if (error instanceof NotFoundError) {
      return reply.status(404).send({ error: error.code, message: error.message });
    }
    if (error instanceof CaptchaRequiredError) {
      return reply.status(429).send({ error: error.code, message: error.message });
    }
    if (error instanceof AuthError) {
      return reply.status(400).send({ error: error.code, message: error.message });
    }
    app.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({ error: 'INTERNAL', message: 'internal_error' });
  });
};


