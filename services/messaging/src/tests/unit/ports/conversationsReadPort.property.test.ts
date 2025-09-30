import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

import {
  createInMemoryConversationStore,
  createInMemoryConversationsReadAdapter,
  createInMemoryConversationsWriteAdapter
} from '../../../ports/conversations/inMemory';

describe('ConversationsReadPort property tests', () => {
  const store = createInMemoryConversationStore();
  const write = createInMemoryConversationsWriteAdapter({ now: () => new Date(), store });
  const read = createInMemoryConversationsReadAdapter({ store });

  it('pagination returns unique conversations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(conversationInputArb, { minLength: 5, maxLength: 25 }),
        fc.integer({ min: 1, max: 10 }),
        async (inputs, pageSize) => {
          store.conversations.clear();
          for (const input of inputs) {
            await write.create(input, actor);
          }

          const seen = new Set<string>();
          let cursor: string | undefined;

          do {
            const page = await read.listPage({ participantId: actor.id }, cursor, pageSize);
            page.items.forEach(conversation => seen.add(conversation.id));
            cursor = page.nextCursor;
          } while (cursor);

          expect(seen.size).toBe(inputs.length);
        }
      ),
      { numRuns: 30 }
    );
  });
});

const actor = { id: '00000000-0000-0000-0000-000000000001', role: 'user' as const };

const conversationInputArb = fc.record({
  type: fc.constantFrom('group', 'channel'),
  participantIds: fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 6 })
});

