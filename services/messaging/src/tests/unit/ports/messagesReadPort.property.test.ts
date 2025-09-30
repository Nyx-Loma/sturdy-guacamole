import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

import {
  createInMemoryMessagesReadAdapter,
  createInMemoryMessagesWriteAdapter,
  createInMemoryMessageStore
} from '../../../ports/messages/inMemory';

describe('MessagesReadPort property tests', () => {
  const store = createInMemoryMessageStore();
  const write = createInMemoryMessagesWriteAdapter({ now: () => new Date(), store });
  const read = createInMemoryMessagesReadAdapter({ store });

  it('cursor pagination preserves ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(messageArb, { minLength: 10, maxLength: 60 }),
        fc.integer({ min: 5, max: 20 }),
        fc.uuid(),
        async (inputs, pageSize, conversationId) => {
          store.messages.clear();
          store.clientIndex.clear();

          let index = 0;
          for (const input of inputs) {
            await write.create({
              input: {
                ...input,
                conversationId,
                encryptedContent: Buffer.from(`msg-${index}`).toString('base64')
              }
            });
            index += 1;
          }

          const collected: string[] = [];
          const seen = new Set<string>();
          let cursor: string | undefined;

          do {
            const page = await read.listPage({ conversationId }, cursor, pageSize);
            page.items.forEach(item => {
              expect(seen.has(item.id)).toBe(false);
              seen.add(item.id);
              collected.push(item.id);
            });
            cursor = page.nextCursor;
          } while (cursor);

          expect(new Set(collected).size).toBe(inputs.length);
        }
      ),
      { numRuns: 50 }
    );
  });
});

const messageArb = fc.record({
  senderId: fc.uuid(),
  type: fc.constantFrom('text', 'image', 'video'),
  metadata: fc.option(fc.dictionary(fc.string({ maxLength: 5 }), fc.string({ maxLength: 10 }))),
  contentSize: fc.option(fc.integer({ min: 1, max: 10_000 })),
  contentMimeType: fc.option(fc.constantFrom('text/plain', 'image/png'))
});

