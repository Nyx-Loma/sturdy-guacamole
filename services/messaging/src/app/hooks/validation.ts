import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export const sendValidationError = (reply: FastifyReply, request: FastifyRequest, error: FastifyError) => {
  reply.code(400).send({
    code: 'VALIDATION_ERROR',
    message: error.message,
    requestId: request.id,
  });
};
