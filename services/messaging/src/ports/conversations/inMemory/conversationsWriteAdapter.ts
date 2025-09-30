import { randomUUID } from 'node:crypto';

import type {
  Conversation,
  CreateConversationInput,
  Participant
} from '../../../domain/types/conversation.types';
import type { Actor, IsoDateTime, Uuid } from '../../shared/types';
import {
  createInMemoryConversationStore,
  type InMemoryConversationStore,
  upsertParticipant
} from './store';
import type { ConversationsWritePort } from '../conversationsWritePort';

export type ConversationsWriteAdapterDeps = {
  now: () => Date;
  generateId?: () => Uuid;
  store?: InMemoryConversationStore;
};

type AdapterContext = {
  now: () => Date;
  generateId: () => Uuid;
  conversations: Map<Uuid, Conversation>;
};

export const createInMemoryConversationsWriteAdapter = (
  deps: ConversationsWriteAdapterDeps = { now: () => new Date() }
): ConversationsWritePort => {
  const context = initializeContext(deps);

  return {
    async create(input, actor) {
      return createConversation(context, input, actor);
    },

    async updateParticipants(id, changes) {
      updateParticipants(context, id, changes);
    },

    async markRead(id, userId, at) {
      markConversationRead(context, id, userId, at);
    },

    async updateSettings(id, settings) {
      updateConversationSettings(context, id, settings);
    },

    async updateMetadata(id, metadata) {
      updateConversationMetadata(context, id, metadata);
    },

    async softDelete(id, at) {
      softDeleteConversation(context, id, at);
    }
  };
};

const initializeContext = (deps: ConversationsWriteAdapterDeps): AdapterContext => {
  const { now, generateId = () => randomUUID(), store = createInMemoryConversationStore() } = deps;
  return { now, generateId, conversations: store.conversations };
};

const createConversation = (context: AdapterContext, input: CreateConversationInput, actor: Actor) => {
  const timestamp = context.now().toISOString();
  const id = context.generateId();
  const record = buildConversationRecord(id, input, actor, timestamp);

  context.conversations.set(id, record);

  return id;
};

const buildConversationRecord = (
  id: Uuid,
  input: CreateConversationInput,
  actor: Actor,
  timestamp: IsoDateTime
): Conversation => ({
  id,
  type: input.type,
  name: input.name,
  description: input.description,
  avatarUrl: input.avatarUrl,
  participants: buildParticipants(input, actor, timestamp),
  settings: input.settings ?? defaultSettings,
  metadata: input.metadata,
  createdAt: timestamp,
  updatedAt: timestamp
});

const updateParticipants = (
  context: AdapterContext,
  id: Uuid,
  changes: Parameters<ConversationsWritePort['updateParticipants']>[1]
) => {
  const conversation = getConversationOrThrow(context.conversations, id);
  const occurredAt = context.now().toISOString();

  applyParticipantChanges(conversation, changes, occurredAt);
  conversation.updatedAt = occurredAt;
};

const markConversationRead = (
  context: AdapterContext,
  id: Uuid,
  userId: Uuid,
  at: IsoDateTime
) => {
  const conversation = getConversationOrThrow(context.conversations, id);
  const participant = conversation.participants.find(p => p.userId === userId && !p.leftAt);
  if (!participant) return;
  participant.lastReadAt = at;
};

const updateConversationSettings = (
  context: AdapterContext,
  id: Uuid,
  settings: Parameters<ConversationsWritePort['updateSettings']>[1]
) => {
  const conversation = getConversationOrThrow(context.conversations, id);
  conversation.settings = { ...conversation.settings, ...settings };
  conversation.updatedAt = context.now().toISOString();
};

const updateConversationMetadata = (
  context: AdapterContext,
  id: Uuid,
  metadata: Parameters<ConversationsWritePort['updateMetadata']>[1]
) => {
  const conversation = getConversationOrThrow(context.conversations, id);
  conversation.name = metadata.name ?? conversation.name;
  conversation.description = metadata.description ?? conversation.description;
  conversation.avatarUrl = metadata.avatarUrl ?? conversation.avatarUrl;
  conversation.updatedAt = context.now().toISOString();
};

const softDeleteConversation = (
  context: AdapterContext,
  id: Uuid,
  at: IsoDateTime
) => {
  const conversation = getConversationOrThrow(context.conversations, id);
  conversation.deletedAt = at;
  conversation.updatedAt = context.now().toISOString();
};

const applyParticipantChanges = (
  conversation: Conversation,
  changes: Parameters<ConversationsWritePort['updateParticipants']>[1],
  occurredAt: IsoDateTime
) => {
  if (changes.add?.length) {
    changes.add.forEach(addition => {
      upsertParticipant(conversation.participants, {
        userId: addition.userId,
        role: addition.role,
        joinedAt: occurredAt,
        muted: false
      });
    });
  }

  if (changes.remove?.length) {
    changes.remove.forEach(userId => {
      const participant = conversation.participants.find(p => p.userId === userId && !p.leftAt);
      if (participant) participant.leftAt = occurredAt;
    });
  }

  if (changes.updateRole?.length) {
    changes.updateRole.forEach(update => {
      const participant = conversation.participants.find(p => p.userId === update.userId && !p.leftAt);
      if (participant) participant.role = update.role;
    });
  }
};

const buildParticipants = (
  input: CreateConversationInput,
  actor: Actor,
  timestamp: IsoDateTime
): Participant[] => {
  const participantIds = input.participantIds.includes(actor.id)
    ? input.participantIds
    : [actor.id, ...input.participantIds];

  return participantIds.map(userId => ({
    userId,
    role: userId === actor.id ? 'owner' : 'member',
    joinedAt: timestamp,
    muted: false
  }));
};

const defaultSettings: Conversation['settings'] = {
  whoCanAddParticipants: 'admin',
  whoCanSendMessages: 'member',
  messageRetentionDays: 0,
  e2eeEnabled: true,
  maxParticipants: 0
};

const getConversationOrThrow = (conversations: Map<Uuid, Conversation>, id: Uuid): Conversation => {
  const conversation = conversations.get(id);
  if (!conversation) {
    throw new Error(`Conversation not found: ${id}`);
  }
  return conversation;
};

