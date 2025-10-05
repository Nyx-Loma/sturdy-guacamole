import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface DirectoryCorsOptions {
  allowedOrigins: string[];
  allowCredentials?: boolean;
}

const buildOriginChecker = (allowedOrigins: string[]) => {
  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    return (_origin: string | undefined, cb: (allow: boolean) => void) => cb(true);
  }
  return (origin: string | undefined, cb: (allow: boolean) => void) => {
    if (!origin) {
      cb(true);
      return;
    }
    cb(allowedOrigins.includes(origin));
  };
};

export const registerCors = async (app: FastifyInstance, options: DirectoryCorsOptions) => {
  if (app.hasDecorator('directoryCorsConfigured')) {
    return;
  }

  const checker = buildOriginChecker(options.allowedOrigins);

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin;
    checker(origin, (allow) => {
      if (!allow) return;

      if (origin) {
        reply.header('Access-Control-Allow-Origin', origin);
      }
      if (options.allowCredentials) {
        reply.header('Access-Control-Allow-Credentials', 'true');
      }
      if (request.method === 'OPTIONS') {
        reply
          .header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
          .header(
            'Access-Control-Allow-Headers',
            'Content-Type,Authorization,If-Match,Idempotency-Key,X-Device-Id,X-Session-Id'
          )
          .header('Access-Control-Max-Age', '86400')
          .code(204)
          .send();
      }
    });
  });

  app.decorate('directoryCorsConfigured', true);
};
