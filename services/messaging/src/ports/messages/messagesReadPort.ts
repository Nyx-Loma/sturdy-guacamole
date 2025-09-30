import type { Message } from '../../domain/types/message.types';
import type { MessageFilter, PageResult, Uuid } from '../shared/types';

export interface MessagesReadPort {
  findById(id: Uuid): Promise<Message | null>;
  list(filter: MessageFilter): Promise<Message[]>;
  count(filter: MessageFilter): Promise<number>;
  listPage(filter: MessageFilter, cursor?: string, limit?: number): Promise<PageResult<Message>>;
}

