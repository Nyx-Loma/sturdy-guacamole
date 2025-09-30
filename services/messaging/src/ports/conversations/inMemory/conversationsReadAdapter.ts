import type { Conversation } from '../../../domain/types/conversation.types';
import type { ConversationFilter, PageResult } from '../../shared/types';
import { createInMemoryConversationStore, type InMemoryConversationStore } from './store';
import type { ConversationsReadPort } from '../conversationsReadPort';

export type ConversationsReadAdapterDeps = {
  store?: InMemoryConversationStore;
};

export const createInMemoryConversationsReadAdapter = (
  deps: ConversationsReadAdapterDeps = {}
): ConversationsReadPort => {
  const { store = createInMemoryConversationStore() } = deps;
  const { conversations } = store;

  return {
    async findById(id) {
      return conversations.get(id) ?? null;
    },

    async list(filter) {
      return filterAndSort(Array.from(conversations.values()), filter);
    },

    async listPage(filter, cursor, limit = 50) {
      const sorted = filterAndSort(Array.from(conversations.values()), filter);

      const cursorIndex = cursor
        ? sorted.findIndex(conversation => conversation.id === cursor)
        : -1;

      const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      const items = sorted.slice(start, start + limit);
      const nextCursor = items.length === limit ? items[items.length - 1].id : undefined;

      return { items, nextCursor } satisfies PageResult<Conversation>;
    }
  };
};

const filterAndSort = (conversations: Conversation[], filter: ConversationFilter) => {
  let results = conversations;

  if (filter.participantId) {
    results = results.filter(conversation =>
      conversation.participants.some(participant => participant.userId === filter.participantId && !participant.leftAt)
    );
  }

  if (filter.type) {
    results = results.filter(conversation => conversation.type === filter.type);
  }

  if (!filter.includeDeleted) {
    results = results.filter(conversation => !conversation.deletedAt);
  }

  return results.sort((a, b) => {
    const aTimestamp = a.lastMessageAt ?? a.updatedAt;
    const bTimestamp = b.lastMessageAt ?? b.updatedAt;
    return new Date(bTimestamp).getTime() - new Date(aTimestamp).getTime();
  });
};

