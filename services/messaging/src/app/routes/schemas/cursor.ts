import { randomUUID } from 'node:crypto';
import { base64url } from 'rfc4648';

type CursorPayload = {
  before?: string;
  after?: string;
  token?: string;
};

export const createMessageId = () => randomUUID();

export const parseCursor = (value?: string | null): CursorPayload | undefined => {
  if (!value) return undefined;
  try {
    const decoded = base64url.parse(value, { loose: true });
    const json = Buffer.from(decoded).toString('utf8');
    return JSON.parse(json) as CursorPayload;
  } catch {
    return undefined;
  }
};

export const encodeCursor = (query: { before?: string; after?: string }, token?: string): string | undefined => {
  if (!token) return undefined;
  const payload: CursorPayload = {
    before: query.before,
    after: query.after,
    token
  };
  const json = JSON.stringify(payload);
  return base64url.stringify(Buffer.from(json), { pad: false });
};


