import { beforeEach, describe, expect, test } from 'vitest';

import {
  createInMemoryConversationStore,
  createInMemoryConversationsReadAdapter,
  createInMemoryConversationsWriteAdapter
} from '../../../../ports/conversations/inMemory';

const actor = { id: '82fcbac5-9583-40d7-8a0e-d728621f0a4e', role: 'user' as const };

const setup = () => {
  const store = createInMemoryConversationStore();
  const write = createInMemoryConversationsWriteAdapter({ now: () => new Date(), store });
  const read = createInMemoryConversationsReadAdapter({ store });
  const reset = () => store.conversations.clear();
  return { store, write, read, reset };
};

describe('conversationsReadPort.list()', () => {
  const { write, read, reset } = setup();

  beforeEach(reset);

  test.each([
    {
      name: 'filters by participant',
      seed: async () => {
        await write.create({ type: 'group', participantIds: [actor.id] }, actor);
        await write.create({ type: 'group', participantIds: ['other'] }, actor);
      },
      filter: { participantId: actor.id },
      assertion: (items: any[]) => expect(items.every(item => item.participants.some((p: any) => p.userId === actor.id))).toBe(true)
    },
    {
      name: 'filters by type',
      seed: async () => {
        await write.create({ type: 'group', participantIds: [actor.id] }, actor);
        await write.create({ type: 'channel', participantIds: [actor.id] }, actor);
      },
      filter: { participantId: actor.id, type: 'channel' as const },
      assertion: (items: any[]) => expect(items.every(item => item.type === 'channel')).toBe(true)
    }
  ])('case: %s', async ({ seed, filter, assertion }) => {
    await seed();
    const list = await read.list(filter);
    assertion(list);
  });
});

describe('conversationsReadPort.listPage()', () => {
  const { write, read, reset } = setup();

  beforeEach(reset);

  test('collects conversations across pages', async () => {
    const ids = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        write.create({ type: 'group', participantIds: [actor.id, crypto.randomUUID()] }, actor)
      )
    );

    const seen = new Set<string>();
    let cursor: string | undefined;

    do {
      const page = await read.listPage({ participantId: actor.id }, cursor, 2);
      page.items.forEach(item => seen.add(item.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen.size).toBe(ids.length);
  });
});
