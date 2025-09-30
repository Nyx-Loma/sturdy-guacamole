import { describe, expect, test } from 'vitest';
import fc from 'fast-check';

import { MessageQuerySchema, MessageSchema, MessageStatusSchema, MessageTypeSchema } from '../../../domain/types/message.types';

const uuidArb = fc.uuid();
const isoDateArb = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2030, 11, 31, 23, 59, 59, 999) })
  .map(ms => new Date(ms).toISOString());

const messageArb = fc.record({
  id: uuidArb,
  conversationId: uuidArb,
  senderId: uuidArb,
  type: fc.constantFrom('text', 'image', 'video', 'audio', 'file', 'system'),
  status: fc.constantFrom('pending', 'sent', 'delivered', 'read', 'failed'),
  encryptedContent: fc.base64String(),
  contentSize: fc.option(fc.integer({ min: 1, max: 10_000 }), { nil: undefined }),
  contentMimeType: fc.option(fc.string(), { nil: undefined }),
  metadata: fc.option(fc.dictionary(fc.string(), fc.jsonValue()), { nil: undefined }),
  createdAt: isoDateArb,
  updatedAt: isoDateArb,
  deliveredAt: fc.option(isoDateArb, { nil: undefined }),
  readAt: fc.option(isoDateArb, { nil: undefined }),
  deletedAt: fc.option(isoDateArb, { nil: undefined })
}).map(record => ({
  ...record,
  status: MessageStatusSchema.parse(record.status),
  type: MessageTypeSchema.parse(record.type)
}));

const messageQueryArb = fc.record({
  conversationId: fc.option(uuidArb, { nil: undefined }),
  senderId: fc.option(uuidArb, { nil: undefined }),
  status: fc.option(fc.constantFrom('pending', 'sent', 'delivered', 'read', 'failed'), { nil: undefined }),
  type: fc.option(fc.constantFrom('text', 'image', 'video', 'audio', 'file', 'system'), { nil: undefined }),
  before: fc.option(isoDateArb, { nil: undefined }),
  after: fc.option(isoDateArb, { nil: undefined }),
  limit: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  includeDeleted: fc.option(fc.boolean(), { nil: undefined })
});

describe('MessageSchema property-based validation', () => {
  test('parses generated messages', () => {
    fc.assert(
      fc.property(messageArb, value => {
        expect(() => MessageSchema.parse(value)).not.toThrow();
      })
    );
  });
});

describe('MessageQuerySchema property-based validation', () => {
  test('accepts generated queries', () => {
    fc.assert(
      fc.property(messageQueryArb, value => {
        expect(() => MessageQuerySchema.parse(value)).not.toThrow();
      })
    );
  });
});

