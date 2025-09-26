import type { FastifyInstance } from 'fastify';
import { registerHealthRoute } from './meta/health';
import { registerErrorHandler } from './meta/errorHandler';
import { accountsRoutes } from './modules/accounts';
import { devicesRoutes } from './modules/devices';
import { pairingRoutes } from './modules/pairing';
import { authRoutes } from './modules/auth';
import { recoveryRoutes } from './modules/recovery';
import { wsRoutes } from './modules/ws';
import type { Container } from '../../container';
import type { Config } from '../../config';

export const registerRoutes = async (
  app: FastifyInstance,
  context: { config: Config; container: Container }
) => {
  registerErrorHandler(app);
  await registerHealthRoute(app);
  await accountsRoutes(app, context);
  await devicesRoutes(app, context);
  await pairingRoutes(app, context);
  await authRoutes(app, context);
  await recoveryRoutes(app, context);
  await wsRoutes(app, context);
};


