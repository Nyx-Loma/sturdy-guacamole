import type { Message } from '../../../domain/types/message.types';
import type { Uuid } from '../../shared/types';

export type InMemoryMessageStore = {
  messages: Map<Uuid, Message>;
  clientIndex: Map<string, Uuid>;
};

export const createInMemoryMessageStore = (): InMemoryMessageStore => ({
  messages: new Map(),
  clientIndex: new Map()
});

export const makeClientKey = (senderId: Uuid, key: string) => `${senderId}:${key}`;

