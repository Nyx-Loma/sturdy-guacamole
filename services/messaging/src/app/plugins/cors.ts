import type { FastifyInstance, FastifyReply } from 'fastify';
import type { MessagingConfig } from '../../config';

const DEFAULT_ALLOW_HEADERS = 'authorization,content-type';
const DEFAULT_ALLOW_METHODS = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS';

interface RegisterCorsOptions {
  config: MessagingConfig;
}

export const registerCors = async (app: FastifyInstance, { config }: RegisterCorsOptions) => {
  const allowedOrigins = config.CORS_ALLOWED_ORIGINS
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowCredentials = config.CORS_ALLOW_CREDENTIALS === true;
  const allowAllOrigins = allowedOrigins.length === 0;
  const allowedOriginSet = new Set(allowedOrigins);

  const isAllowedOrigin = (origin?: string): boolean => {
    if (!origin) return true;
    if (allowAllOrigins) return true;
    return allowedOriginSet.has(origin);
  };

  const applyCommonHeaders = (reply: FastifyReply, origin: string | undefined, allowed: boolean) => {
    reply.header('Vary', 'Origin');
    if (!allowed) return;
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
    } else if (allowAllOrigins && !allowCredentials) {
      reply.header('Access-Control-Allow-Origin', '*');
    }
    if (allowCredentials && origin) {
      reply.header('Access-Control-Allow-Credentials', 'true');
    }
  };

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin as string | undefined;
    const allowed = isAllowedOrigin(origin);

    if (request.method === 'OPTIONS') {
      applyCommonHeaders(reply, origin, allowed);
      if (!allowed) {
        reply.code(403).send();
        return;
      }
      const requestedMethod = request.headers['access-control-request-method'];
      const requestedHeaders = request.headers['access-control-request-headers'];

      reply.header('Access-Control-Allow-Methods', requestedMethod ?? DEFAULT_ALLOW_METHODS);
      if (requestedHeaders) {
        reply.header('Access-Control-Allow-Headers', requestedHeaders);
      } else {
        reply.header('Access-Control-Allow-Headers', DEFAULT_ALLOW_HEADERS);
      }
      reply.code(204).send();
      return;
    }

    applyCommonHeaders(reply, origin, allowed);
    if (!allowed) {
      reply.code(403).send({
        code: 'CORS_ORIGIN_FORBIDDEN',
        message: 'Origin not allowed'
      });
    }
  });
};


