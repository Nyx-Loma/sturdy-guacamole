import { randomUUID } from 'node:crypto';

import type { Message } from '../../../domain/types/message.types';
import type { Uuid } from '../../shared/types';
import { createInMemoryMessageStore, makeClientKey, type InMemoryMessageStore } from './store';
import type { MessagesWritePort } from '../messagesWritePort';

export type MessagesWriteAdapterDeps = {
  now: () => Date;
  generateId?: () => Uuid;
  store?: InMemoryMessageStore;
};

export const createInMemoryMessagesWriteAdapter = (
  deps: MessagesWriteAdapterDeps = { now: () => new Date() }
): MessagesWritePort => {
  const { now, generateId = () => randomUUID(), store = createInMemoryMessageStore() } = deps;

  const { messages, clientIndex } = store;

  const getMessageOrThrow = (id: Uuid): Message => {
    const message = messages.get(id);
    if (!message) {
      throw new Error(`Message not found: ${id}`);
    }
    return message;
  };

  return {
    async create({ input, idempotencyKey }) {

      if (idempotencyKey) {
        const existingId = clientIndex.get(makeClientKey(input.senderId, idempotencyKey));
        if (existingId) return existingId;
      }

      const timestamp = now().toISOString();
      const id = generateId();

      const message: Message = {
        id,
        conversationId: input.conversationId,
        senderId: input.senderId,
        type: input.type,
        status: 'sent',
        encryptedContent: input.encryptedContent,
        metadata: input.metadata,
        contentSize: input.contentSize,
        contentMimeType: input.contentMimeType,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      messages.set(id, message);

      if (idempotencyKey) {
        clientIndex.set(makeClientKey(input.senderId, idempotencyKey), id);
      }

      return id;
    },

    async updateStatus(id, status, at) {
      const message = getMessageOrThrow(id);

      message.status = status;
      message.updatedAt = now().toISOString();

      if (status === 'delivered') message.deliveredAt = at;
      if (status === 'read') {
        message.readAt = at;
        if (!message.deliveredAt) {
          message.deliveredAt = at;
        }
      }
    },

    async markAsRead(ids, at) {
      const timestamp = now().toISOString();
      for (const id of ids) {
        const message = messages.get(id);
        if (!message) continue;
        message.status = 'read';
        message.readAt = at;
        message.updatedAt = timestamp;
      }
    },

    async softDelete(id, at) {
      const message = getMessageOrThrow(id);
      message.deletedAt = at;
      message.updatedAt = now().toISOString();
    }
  };
};

