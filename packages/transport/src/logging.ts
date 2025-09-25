import { createHash } from 'node:crypto';

export type SafeLogger = {
  debug?: (first: unknown, message?: string) => void;
  info?: (first: unknown, message?: string) => void;
  warn?: (first: unknown, message?: string) => void;
  error?: (first: unknown, message?: string) => void;
};

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 8);

export const redactToken = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  return `***${hashToken(value)}`;
};

export const logWithContext = (
  logger: SafeLogger | undefined,
  level: keyof SafeLogger,
  message: string,
  context?: Record<string, unknown>
) => {
  const fn = logger?.[level];
  if (typeof fn !== 'function') {
    return;
  }

  if (context) {
    fn.call(logger, context, message);
    return;
  }

  fn.call(logger, message);
};

export const sanitizeError = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  return { message: 'unknown' };
};

