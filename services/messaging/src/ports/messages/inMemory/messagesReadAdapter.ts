import type { Message } from '../../../domain/types/message.types';
import type { MessageFilter, PageResult } from '../../shared/types';
import {
  createInMemoryMessageStore,
  type InMemoryMessageStore
} from './store';
import type { MessagesReadPort } from '../messagesReadPort';

export type MessagesReadAdapterDeps = {
  store?: InMemoryMessageStore;
};

type FilteredMessages = Message[];

type Cursor = string | undefined;

type Limit = number | undefined;

export const createInMemoryMessagesReadAdapter = (
  deps: MessagesReadAdapterDeps = {}
): MessagesReadPort => {
  const { store = createInMemoryMessageStore() } = deps;
  const { messages } = store;

  return {
    async findById(id) {
      return messages.get(id) ?? null;
    },

    async list(filter) {
      return paginate(filterMessages(Array.from(messages.values()), filter));
    },

    async count(filter) {
      return filterMessages(Array.from(messages.values()), filter).length;
    },

    async listPage(filter, cursor, limit = 50) {
      const sorted = paginate(filterMessages(Array.from(messages.values()), filter));
      const items = sliceWithCursor(sorted, cursor, limit);
      const nextCursor = deriveNextCursor(items, limit);

      return { items, nextCursor } satisfies PageResult<Message>;
    }
  };
};

const filterMessages = (messages: Message[], filter: MessageFilter): FilteredMessages => {
  const byConversation = filter.conversationId
    ? messages.filter(message => message.conversationId === filter.conversationId)
    : messages;

  const bySender = filter.senderId
    ? byConversation.filter(message => message.senderId === filter.senderId)
    : byConversation;

  const byStatus = filter.status
    ? bySender.filter(message => message.status === filter.status)
    : bySender;

  const byType = filter.type ? byStatus.filter(message => message.type === filter.type) : byStatus;

  const withoutDeleted = filter.includeDeleted
    ? byType
    : byType.filter(message => !message.deletedAt);

  const before = filter.before
    ? withoutDeleted.filter(message => message.createdAt < filter.before!)
    : withoutDeleted;

  const after = filter.after
    ? before.filter(message => message.createdAt > filter.after!)
    : before;

  return sortMessages(after);
};

const sortMessages = (messages: Message[]): Message[] =>
  [...messages].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

const paginate = (messages: Message[], limit?: Limit): Message[] =>
  typeof limit === 'number' ? messages.slice(0, limit) : messages;

const sliceWithCursor = (messages: Message[], cursor: Cursor, limit: number): Message[] => {
  const cursorIndex = cursor ? messages.findIndex(message => message.id === cursor) : -1;
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  return messages.slice(start, start + limit);
};

const deriveNextCursor = (items: Message[], limit: number): string | undefined =>
  items.length === limit ? items[items.length - 1].id : undefined;

