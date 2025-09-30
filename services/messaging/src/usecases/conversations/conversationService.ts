import type {
  Conversation,
  ConversationMetadata,
  ConversationSettings,
  Participant,
  ParticipantRole
} from '../../domain/types/conversation.types';
import {
  ConversationFullError,
  ConversationNotFoundError,
  InsufficientPermissionsError,
  NotAParticipantError
} from '../../domain/errors';
import type {
  ConversationEvent,
  ConversationsEventsPort
} from '../../ports/conversations/conversationsEventsPort';
import type { ConversationsReadPort } from '../../ports/conversations/conversationsReadPort';
import type {
  ConversationsWritePort,
  ParticipantChange
} from '../../ports/conversations/conversationsWritePort';
import type { Actor, IsoDateTime, Uuid } from '../../ports/shared/types';

export type ConversationServiceDeps = {
  read: ConversationsReadPort;
  write: ConversationsWritePort;
  events: ConversationsEventsPort;
  now?: () => Date;
};

export type ConversationService = {
  create(input: Parameters<ConversationsWritePort['create']>[0], actor: Actor): Promise<Uuid>;
  addParticipants(conversationId: Uuid, additions: NonNullable<ParticipantChange['add']>, actor: Actor): Promise<void>;
  removeParticipant(conversationId: Uuid, userId: Uuid, actor: Actor): Promise<void>;
  updateParticipantRole(conversationId: Uuid, userId: Uuid, role: ParticipantRole, actor: Actor): Promise<void>;
  updateSettings(conversationId: Uuid, settings: Partial<ConversationSettings>, actor: Actor): Promise<void>;
  updateMetadata(conversationId: Uuid, metadata: Partial<ConversationMetadata>, actor: Actor): Promise<void>;
  markRead(conversationId: Uuid, actorId: Uuid, at?: IsoDateTime): Promise<void>;
  softDelete(conversationId: Uuid, at?: IsoDateTime, actor?: Actor): Promise<void>;
};

const DEFAULT_NOW = () => new Date();

const roleWeight: Record<ParticipantRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  observer: 0
};

const canManage = (role: ParticipantRole, required: 'owner' | 'admin' | 'member') => {
  if (required === 'member') return true;
  if (required === 'admin') return role === 'admin' || role === 'owner';
  return role === 'owner';
};

const requirementFor = (conversation: Conversation, intent: 'add' | 'remove' | 'updateRole' | 'updateSettings' | 'updateMetadata'): 'owner' | 'admin' | 'member' => {
  if (intent === 'add') {
    return conversation.settings.whoCanAddParticipants ?? 'admin';
  }
  if (intent === 'remove' || intent === 'updateRole') {
    return conversation.settings.whoCanAddParticipants ?? 'admin';
  }
  if (intent === 'updateSettings' || intent === 'updateMetadata') {
    return 'admin';
  }
  return 'member';
};

const activeParticipants = (conversation: Conversation) =>
  conversation.participants.filter(participant => !participant.leftAt);

const ensureConversation = async (
  read: ConversationsReadPort,
  id: Uuid
): Promise<Conversation> => {
  const conversation = await read.findById(id);
  if (!conversation) throw new ConversationNotFoundError(id);
  return conversation;
};

const ensureActorParticipant = (conversation: Conversation, actor: Actor): Participant => {
  const participant = activeParticipants(conversation).find(p => p.userId === actor.id);
  if (!participant) {
    throw new NotAParticipantError(actor.id, conversation.id);
  }
  return participant;
};

const ensurePermission = (
  conversation: Conversation,
  actor: Actor,
  intent: 'add' | 'remove' | 'updateRole' | 'updateSettings' | 'updateMetadata'
): Participant => {
  const participant = ensureActorParticipant(conversation, actor);
  const required = requirementFor(conversation, intent);
  if (!canManage(participant.role, required)) {
    throw new InsufficientPermissionsError(intent, required);
  }
  return participant;
};

const assertCapacity = (
  conversation: Conversation,
  additions: NonNullable<ParticipantChange['add']>
) => {
  const max = conversation.settings.maxParticipants ?? 0;
  if (max <= 0) return;
  const current = activeParticipants(conversation).length;
  if (current + additions.length > max) {
    throw new ConversationFullError(conversation.id, max);
  }
};

const publishEvents = async (events: ConversationsEventsPort, entries: ConversationEvent[]) => {
  for (const entry of entries) {
    await events.publish(entry);
  }
};

export const createConversationService = ({
  read,
  write,
  events,
  now = DEFAULT_NOW
}: ConversationServiceDeps): ConversationService => {
  return {
    async create(input, actor) {
      const id = await write.create(input, actor);
      await events.publish({ kind: 'ConversationCreated', id });
      return id;
    },

    async addParticipants(conversationId, additions, actor) {
      if (!additions.length) return;
      const conversation = await ensureConversation(read, conversationId);
      ensurePermission(conversation, actor, 'add');
      assertCapacity(conversation, additions);

      await write.updateParticipants(conversationId, { add: additions }, actor);

      await publishEvents(
        events,
        additions.map(add => ({
          kind: 'ParticipantAdded',
          conversationId,
          userId: add.userId
        }))
      );
    },

    async removeParticipant(conversationId, userId, actor) {
      const conversation = await ensureConversation(read, conversationId);
      const actorParticipant = ensurePermission(conversation, actor, 'remove');

      const target = activeParticipants(conversation).find(p => p.userId === userId);
      if (!target) return;
      if (roleWeight[target.role] >= roleWeight[actorParticipant.role]) {
        throw new InsufficientPermissionsError('remove', actorParticipant.role);
      }

      await write.updateParticipants(conversationId, { remove: [userId] }, actor);
      await events.publish({ kind: 'ParticipantRemoved', conversationId, userId });
    },

    async updateParticipantRole(conversationId, userId, role, actor) {
      await ensurePermission(await ensureConversation(read, conversationId), actor, 'updateRole');
      await write.updateParticipants(
        conversationId,
        { updateRole: [{ userId, role }] },
        actor
      );
    },

    async updateSettings(conversationId, settings, actor) {
      await ensurePermission(await ensureConversation(read, conversationId), actor, 'updateSettings');
      await write.updateSettings(conversationId, settings, actor);
    },

    async updateMetadata(conversationId, metadata, actor) {
      await ensurePermission(await ensureConversation(read, conversationId), actor, 'updateMetadata');
      await write.updateMetadata(conversationId, metadata, actor);
    },

    async markRead(conversationId, actorId, at) {
      await write.markRead(conversationId, actorId, at ?? now().toISOString());
    },

    async softDelete(conversationId, at, actor) {
      const timestamp = at ?? now().toISOString();
      const actorContext = actor ?? { id: 'system', role: 'owner' as ParticipantRole };
      await write.softDelete(conversationId, timestamp, actorContext);
      await events.publish({ kind: 'ConversationSoftDeleted', id: conversationId });
    }
  };
};


