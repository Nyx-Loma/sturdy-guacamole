import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  MessageSchema,
  MessageStatus,
  MessageType,
  MessageStatusSchema,
  MessageTypeSchema,
  MessageQuerySchema
} from '../../../domain/types/message.types';

const baseMessage = {
  id: '0c2f5a68-72a9-4c5b-b8d1-4d11bfba9a63',
  conversationId: 'd2b3e518-5b84-4f2c-95de-2cb9f99b0284',
  senderId: '5b3518b4-5677-4e9b-8d1b-05e32b66ed15',
  type: MessageType.TEXT,
  status: MessageStatus.SENT,
  encryptedContent: 'c29tZS1jb250ZW50',
  createdAt: '2025-09-29T12:00:00.000Z',
  updatedAt: '2025-09-29T12:00:00.000Z'
};

const validMessages = [
  baseMessage,
  { ...baseMessage, id: '1d8be4fb-0342-4f7b-a5dc-1fbab6dcb63e', status: MessageStatus.DELIVERED, deliveredAt: '2025-09-29T12:01:00.000Z' },
  { ...baseMessage, id: 'f2474f1c-158f-4cce-9174-32ad6717ff97', status: MessageStatus.READ, readAt: '2025-09-29T12:02:00.000Z' },
  { ...baseMessage, id: 'b5b4f6f8-8f6e-4c8a-8ad2-1e0c779c549d', status: MessageStatus.PENDING },
  { ...baseMessage, id: 'cad0bf0d-7208-4df3-b7fc-14cb1ef1ba58', status: MessageStatus.FAILED },
  { ...baseMessage, id: '2f5c0771-c306-4cfd-9dc9-3844850fb602', type: MessageType.FILE, contentSize: 1024, contentMimeType: 'application/pdf' },
  { ...baseMessage, id: 'b4cf03b0-f47a-4a6c-b8fc-0babd5dedc4e', type: MessageType.IMAGE },
  { ...baseMessage, id: 'a1f35a7b-52ae-4c8a-bcdf-86aa3d3c8d6a', type: MessageType.VIDEO },
  { ...baseMessage, id: 'b2214527-74e0-437e-9fb9-0c391d809d74', type: MessageType.AUDIO },
  { ...baseMessage, id: 'f3356d2e-1de4-47ad-928b-74b500bbf73f', type: MessageType.SYSTEM, metadata: { event: 'user_joined' } },
  { ...baseMessage, id: '67cbcfa8-0eae-4f18-9caa-8adfc93550c4', metadata: { replyTo: 'original', mentions: ['user-a'] } },
  { ...baseMessage, id: 'a2c50f75-0f9a-4fe0-844b-ebe8ef15c9dc', deletedAt: '2025-09-29T12:30:00.000Z' }
];

const invalidMessages = [
  { ...baseMessage, id: 'not-a-uuid' },
  { ...baseMessage, conversationId: '123' },
  { ...baseMessage, senderId: 'not-uuid' },
  { ...baseMessage, type: 'unknown' },
  { ...baseMessage, status: 'unknown' },
  { ...baseMessage, encryptedContent: 'not base64?' },
  { ...baseMessage, contentSize: -1 },
  { ...baseMessage, contentSize: 10.5 },
  { ...baseMessage, createdAt: 'not a date' },
  { ...baseMessage, updatedAt: 'yesterday' },
  { ...baseMessage, deliveredAt: 'invalid date' },
  { ...baseMessage, readAt: 123 },
  { ...baseMessage, metadata: 123 },
  { ...baseMessage, contentMimeType: 123 }
];

const statusCases = Object.values(MessageStatus).map(status => ({ status }));
const typeCases = Object.values(MessageType).map(type => ({ type }));

const queryBase = {
  conversationId: 'df7fe55a-d489-4ba1-9d54-bf766737d0a4',
  senderId: 'adf8b43c-1f48-4d6b-b5d0-302a476a5f09',
  status: MessageStatus.READ,
  type: MessageType.TEXT,
  before: '2025-09-29T12:05:00.000Z',
  after: '2025-09-29T11:00:00.000Z',
  limit: 40,
  includeDeleted: true
};

const validQueries = [
  queryBase,
  { ...queryBase, limit: undefined },
  { conversationId: queryBase.conversationId },
  { senderId: queryBase.senderId },
  { status: MessageStatus.SENT },
  { type: MessageType.IMAGE },
  { before: '2025-09-29T12:05:00.000Z' },
  { after: '2025-09-28T12:05:00.000Z' },
  { includeDeleted: false },
  {}
];

const invalidQueries = [
  { ...queryBase, conversationId: 'not-uuid' },
  { ...queryBase, senderId: 'bad' },
  { ...queryBase, status: 'invalid' },
  { ...queryBase, type: 'bad-type' },
  { ...queryBase, before: 'not-date' },
  { ...queryBase, after: 'still-bad' },
  { ...queryBase, limit: 0 },
  { ...queryBase, limit: -10 },
  { ...queryBase, limit: 101 },
  { ...queryBase, includeDeleted: 'yes' }
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('MessageSchema valid cases', () => {
  test.each(validMessages)('accepts valid message %#', message => {
    expect(() => MessageSchema.parse(message)).not.toThrow();
  });
});

describe('MessageSchema invalid cases', () => {
  test.each(invalidMessages)('rejects invalid message %#', message => {
    expect(() => MessageSchema.parse(message)).toThrow();
  });
});

describe('MessageStatusSchema enumeration', () => {
  test.each(statusCases)('allows status %s', ({ status }) => {
    expect(() => MessageStatusSchema.parse(status)).not.toThrow();
  });

  test('rejects unknown status', () => {
    expect(() => MessageStatusSchema.parse('UNKNOWN')).toThrow();
  });
});

describe('MessageTypeSchema enumeration', () => {
  test.each(typeCases)('allows type %s', ({ type }) => {
    expect(() => MessageTypeSchema.parse(type)).not.toThrow();
  });

  test('rejects unknown type', () => {
    expect(() => MessageTypeSchema.parse('made-up')).toThrow();
  });
});

describe('MessageQuerySchema valid cases', () => {
  test.each(validQueries)('accepts query %#', query => {
    expect(() => MessageQuerySchema.parse(query)).not.toThrow();
  });
});

describe('MessageQuerySchema invalid cases', () => {
  test.each(invalidQueries)('rejects query %#', query => {
    expect(() => MessageQuerySchema.parse(query)).toThrow();
  });
});

