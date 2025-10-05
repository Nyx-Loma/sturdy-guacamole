import type { Conversation, Participant } from '../../domain/types/conversation.types';
import type { Conversation as ConversationResponse, Participant as ParticipantResponse } from './schemas/conversations';

const mapParticipantRole = (role: Participant['role']): ParticipantResponse['role'] => {
  if (role === 'owner' || role === 'admin') return 'admin';
  return 'member';
};

const resolveCreatorId = (participants: Participant[]): string => {
  const owner = participants.find((participant) => participant.role === 'owner');
  if (owner) return owner.userId;
  return participants[0]?.userId ?? 'unknown-creator';
};

export const mapConversationResponse = (conversation: Conversation): ConversationResponse => ({
  id: conversation.id,
  type: conversation.type,
  creatorId: resolveCreatorId(conversation.participants),
  metadata: {
    name: conversation.name,
    avatar: conversation.avatarUrl,
    description: conversation.description,
    custom: conversation.metadata ?? {},
  },
  version: conversation.version ?? 0,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
  deletedAt: conversation.deletedAt ?? null,
});

export const mapParticipantsResponse = (participants: Participant[]): ParticipantResponse[] =>
  participants.map((participant) => ({
    userId: participant.userId,
    role: mapParticipantRole(participant.role),
    joinedAt: participant.joinedAt,
    leftAt: participant.leftAt ?? null,
  }));