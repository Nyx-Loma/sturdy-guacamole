import pino from 'pino';

export const createLogger = (level: pino.Level = 'info') =>
  pino({ level, redact: ['req.headers.authorization', 'req.headers.cookie'] });


