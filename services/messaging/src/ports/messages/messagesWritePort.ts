import type {
  CreateMessageInput,
  MessageStatus
} from '../../domain/types/message.types';
import type { Actor, IsoDateTime, Uuid } from '../shared/types';

export type CreateMessageCommand = {
  input: CreateMessageInput;
  idempotencyKey?: string;
  messageId?: Uuid;
};

export interface MessagesWritePort {
  create(command: CreateMessageCommand): Promise<Uuid>;
  updateStatus(id: Uuid, status: MessageStatus, at: IsoDateTime): Promise<void>;
  markAsRead(ids: Uuid[], at: IsoDateTime, actor: Actor): Promise<void>;
  softDelete(id: Uuid, at: IsoDateTime, actor: Actor): Promise<void>;
}

