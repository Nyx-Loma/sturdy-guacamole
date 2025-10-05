import type {
  ConversationSettings,
  ConversationMetadata,
  CreateConversationInput,
  ParticipantRole
} from '../../domain/types/conversation.types';
import type { Actor, IsoDateTime, Uuid } from '../shared/types';

export type ParticipantChange = {
  add?: Array<{ userId: Uuid; role: ParticipantRole }>;
  remove?: Uuid[];
  updateRole?: Array<{ userId: Uuid; role: ParticipantRole }>;
};

export interface ConversationsWritePort {
  create(input: CreateConversationInput & { idempotencyKey?: string }, actor: Actor): Promise<Uuid>;
  updateParticipants(id: Uuid, changes: ParticipantChange, actor: Actor): Promise<void>;
  markRead(id: Uuid, userId: Uuid, at: IsoDateTime): Promise<void>;
  updateSettings(id: Uuid, settings: Partial<ConversationSettings>, actor: Actor): Promise<void>;
  updateMetadata(id: Uuid, metadata: Partial<ConversationMetadata> & { expectedVersion?: number }, actor: Actor): Promise<void>;
  softDelete(id: Uuid, at: IsoDateTime, actor: Actor): Promise<void>;
}

