import type { CreateMessageInput, Message } from '../../domain/types/message.types';
import { MessageNotFoundError } from '../../domain/errors';
import type { MessagesReadPort } from '../../ports/messages/messagesReadPort';
import type {
  CreateMessageCommand,
  MessagesWritePort
} from '../../ports/messages/messagesWritePort';
import type { ConversationsEventsPort } from '../../ports/conversations/conversationsEventsPort';
import type { Actor, IsoDateTime, Uuid } from '../../ports/shared/types';

export type MessageServiceDeps = {
  read: MessagesReadPort;
  write: MessagesWritePort;
  events: ConversationsEventsPort;
  now?: () => Date;
  preview?: (input: CreateMessageInput) => string;
};

export type SendOptions = {
  messageId?: Uuid;
};

export type MessageService = {
  send(command: CreateMessageCommand, actor: Actor, options?: SendOptions): Promise<Uuid>;
  markRead(ids: Uuid[], at?: IsoDateTime, actor?: Actor): Promise<void>;
  updateStatus(id: Uuid, status: Message['status'], at?: IsoDateTime): Promise<void>;
  softDelete(id: Uuid, at?: IsoDateTime, actor?: Actor): Promise<void>;
};

const DEFAULT_NOW = () => new Date();
const DEFAULT_PREVIEW = (input: CreateMessageInput) => {
  if (input.type === 'text') return input.encryptedContent.slice(0, 120);
  return `[${input.type} message]`;
};

const ensureMessage = async (read: MessagesReadPort, id: Uuid) => {
  const message = await read.findById(id);
  if (!message) throw new MessageNotFoundError(id);
  return message;
};

export const createMessageService = ({
  read,
  write,
  events,
  now = DEFAULT_NOW,
  preview = DEFAULT_PREVIEW
}: MessageServiceDeps): MessageService => {
  return {
    async send(command, actor, options) {
      const id = await write.create({ ...command, messageId: options?.messageId });
      let message = await ensureMessage(read, id);

      // Retry ensuring the message to handle eventual consistency
      if (!message) {
        message = await ensureMessage(read, id);
      }

      await events.updateLastMessage({
        conversationId: message.conversationId,
        messageId: id,
        preview: preview(command.input),
        occurredAt: message.createdAt
      });

      await events.publish({
        kind: 'MessageSent',
        conversationId: message.conversationId,
        messageId: id,
        actorId: actor.id
      });

      return id;
    },

    async markRead(ids, at, actor) {
      if (!ids.length) return;
      await write.markAsRead(ids, at ?? now().toISOString(), actor ?? { id: 'system', role: 'system' });
    },

    async updateStatus(id, status, at) {
      await write.updateStatus(id, status, at ?? now().toISOString());
    },

    async softDelete(id, at, actor) {
      const message = await ensureMessage(read, id);
      const timestamp = at ?? now().toISOString();
      await write.softDelete(id, timestamp, actor ?? { id: 'system', role: 'system' });
      await events.updateLastMessage({
        conversationId: message.conversationId,
        messageId: id,
        preview: '',
        occurredAt: timestamp
      });
    }
  };
};


