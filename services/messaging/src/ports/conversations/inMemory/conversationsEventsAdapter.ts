import type { Conversation } from '../../../domain/types/conversation.types';
import type { ConversationsEventsPort } from '../conversationsEventsPort';
import {
  createInMemoryConversationStore,
  type InMemoryConversationStore
} from './store';

export type ConversationsEventsAdapterDeps = {
  store?: InMemoryConversationStore;
};

export const createInMemoryConversationsEventsAdapter = (
  deps: ConversationsEventsAdapterDeps = {}
): ConversationsEventsPort => {
  const { store = createInMemoryConversationStore() } = deps;
  const { conversations } = store;

  return {
    async updateLastMessage(update) {
      const conversation = getConversationOrThrow(conversations, update.conversationId);
      conversation.lastMessageId = update.messageId;
      conversation.lastMessageAt = update.occurredAt;
      conversation.lastMessagePreview = update.preview;
      conversation.updatedAt = update.occurredAt;
    },

    async publish() {
      return;
    }
  };
};

const getConversationOrThrow = (
  conversations: Map<string, Conversation>,
  id: string
) => {
  const conversation = conversations.get(id);
  if (!conversation) {
    throw new Error(`Conversation not found: ${id}`);
  }
  return conversation;
};

