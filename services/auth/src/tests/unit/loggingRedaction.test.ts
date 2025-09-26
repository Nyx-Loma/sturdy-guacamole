import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { createLogger } from '../../logging';

const SENSITIVE_FIELDS = ['refresh_token', 'recovery_code', 'pairing_token'];

describe('logger redaction', () => {
  it('redacts sensitive fields in logs', () => {
    const buffer: string[] = [];
    const capture = new PassThrough();
    capture.on('data', (chunk) => buffer.push(chunk.toString()));

    const logger = createLogger({ level: 'info' }, capture);
    SENSITIVE_FIELDS.forEach((field) => {
      logger.info({ [field]: 'secret', safe: true }, `${field} test`);
    });

    const records = buffer.map((line) => JSON.parse(line));
    records.forEach((record) => {
      SENSITIVE_FIELDS.forEach((field) => {
        if (record[field]) {
          expect(record[field]).toBe('[Redacted]');
        }
      });
      expect(record.safe).toBe(true);
    });
  });
});
