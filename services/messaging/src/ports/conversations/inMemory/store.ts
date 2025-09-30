import type {
  Conversation,
  Participant
} from '../../../domain/types/conversation.types';
import type { Uuid } from '../../shared/types';

export type InMemoryConversationStore = {
  conversations: Map<Uuid, Conversation>;
};

export const createInMemoryConversationStore = (): InMemoryConversationStore => ({
  conversations: new Map()
});

export const upsertParticipant = (participants: Participant[], next: Participant) => {
  const existingIndex = participants.findIndex(participant => participant.userId === next.userId && !participant.leftAt);
  if (existingIndex >= 0) {
    participants[existingIndex] = next;
    return;
  }
  participants.push(next);
};

