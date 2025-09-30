import type { Conversation } from '../../domain/types/conversation.types';
import type { ConversationFilter, PageResult, Uuid } from '../shared/types';

export interface ConversationsReadPort {
  findById(id: Uuid): Promise<Conversation | null>;
  list(filter: ConversationFilter): Promise<Conversation[]>;
  listPage(filter: ConversationFilter, cursor?: string, limit?: number): Promise<PageResult<Conversation>>;
}

