import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import {
  ConversationNotFoundError,
  DuplicateMessageError,
  MessagingError,
  MessageNotFoundError,
  NotAParticipantError
} from '../domain/errors';

type FastifyErrorHandler = Parameters<FastifyInstance['setErrorHandler']>[0];

const mapErrorToStatus = (error: Error): { statusCode: number; code: string } => {
  if ((error as { code?: string }).code === 'FST_ERR_VALIDATION') {
    return { statusCode: 400, code: 'VALIDATION_ERROR' };
  }

  if (error instanceof MessagingError) {
    return { statusCode: error.statusCode, code: error.code };
  }

  if (error instanceof ZodError) {
    return { statusCode: 400, code: 'VALIDATION_ERROR' };
  }

  if (error instanceof DuplicateMessageError) {
    return { statusCode: 409, code: error.code };
  }

  if (error instanceof MessageNotFoundError || error instanceof ConversationNotFoundError) {
    return { statusCode: 404, code: error.code };
  }

  if (error instanceof NotAParticipantError) {
    return { statusCode: 403, code: error.code };
  }

  return { statusCode: 500, code: 'INTERNAL_SERVER_ERROR' };
};

export const registerErrorHandler = (app: FastifyInstance) => {
  const handler: FastifyErrorHandler = (error, request, reply) => {
    const { statusCode, code } = mapErrorToStatus(error);

    const responseBody = {
      code,
      message: error.message,
      details: error instanceof ZodError ? error.flatten() : undefined,
      requestId: request.id
    };

    if (statusCode === 500) {
      request.log.error({ err: error, requestId: request.id }, 'Unhandled error');
    } else if (statusCode >= 400 && statusCode < 500) {
      request.log.warn({ err: error, requestId: request.id }, 'Client error');
    }

    reply
      .code(statusCode)
      .type('application/json')
      .send(responseBody);
  };

  app.setErrorHandler(handler);
};


