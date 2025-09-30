import type { ConversationType, ParticipantRole } from '../../domain/types/conversation.types';
import type { MessageStatus, MessageType } from '../../domain/types/message.types';

export type Uuid = string;

export type IsoDateTime = string;

export type Actor = {
  id: Uuid;
  role: 'system' | 'user' | 'service' | ParticipantRole;
};

export type MessageFilter = {
  conversationId?: Uuid;
  senderId?: Uuid;
  status?: MessageStatus;
  type?: MessageType;
  before?: IsoDateTime;
  after?: IsoDateTime;
  includeDeleted?: boolean;
};

export type ConversationFilter = {
  participantId?: Uuid;
  type?: ConversationType;
  includeDeleted?: boolean;
};

export type PageResult<TItem> = {
  items: TItem[];
  nextCursor?: string;
};

