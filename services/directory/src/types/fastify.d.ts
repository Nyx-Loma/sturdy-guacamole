import type { DirectoryService } from '../services/directoryService';

declare module 'fastify' {
  interface FastifyInstance {
    directoryService: DirectoryService;
  }
}


