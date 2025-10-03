import type { IsoDateTime, Uuid } from '../shared/types';

export type ConversationEvent =
  | { kind: 'ConversationCreated'; id: Uuid }
  | { kind: 'ParticipantAdded'; conversationId: Uuid; userId: Uuid }
  | { kind: 'ParticipantRemoved'; conversationId: Uuid; userId: Uuid }
  | { kind: 'ConversationSoftDeleted'; id: Uuid }
  | { kind: 'MessageSent'; conversationId: Uuid; messageId: Uuid; actorId: Uuid };

export type LastMessageUpdate = {
  conversationId: Uuid;
  messageId: Uuid;
  preview: string;
  occurredAt: IsoDateTime;
};

export interface ConversationsEventsPort {
  updateLastMessage(update: LastMessageUpdate): Promise<void>;
  publish(event: ConversationEvent): Promise<void>;
}

