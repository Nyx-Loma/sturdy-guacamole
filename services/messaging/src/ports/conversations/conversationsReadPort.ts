import type { Conversation, Participant } from '../../domain/types/conversation.types';
import type { ConversationFilter, PageResult, Uuid } from '../shared/types';

export type ParticipantListOptions = {
  limit?: number;
  cursor?: string;
  includeLeft?: boolean;
};

export interface ConversationsReadPort {
  findById(id: Uuid): Promise<Conversation | null>;
  list(filter: ConversationFilter): Promise<Conversation[]>;
  listPage(filter: ConversationFilter, cursor?: string, limit?: number): Promise<PageResult<Conversation>>;
  listParticipants(id: Uuid, options?: ParticipantListOptions): Promise<PageResult<Participant> | null>;
}

