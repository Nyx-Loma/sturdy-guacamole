import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createMessageService } from '../../../usecases/messages/messageService';

const now = () => new Date('2025-10-02T00:00:00.000Z');

const baseMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'message-id',
  conversationId: 'conversation-id',
  senderId: 'sender-id',
  type: 'text',
  status: 'sent',
  encryptedContent: 'SGVsbG8=',
  metadata: undefined,
  contentSize: undefined,
  contentMimeType: undefined,
  createdAt: '2025-10-02T00:00:00.000Z',
  updatedAt: '2025-10-02T00:00:00.000Z',
  deliveredAt: undefined,
  readAt: undefined,
  deletedAt: undefined,
  ...overrides
});

const createDeps = () => {
  const read = {
    findById: vi.fn()
  } as unknown as Parameters<typeof createMessageService>[0]['read'];

  const write = {
    create: vi.fn(),
    markAsRead: vi.fn(),
    updateStatus: vi.fn(),
    softDelete: vi.fn()
  } as unknown as Parameters<typeof createMessageService>[0]['write'];

  const events = {
    updateLastMessage: vi.fn(),
    publish: vi.fn()
  } as unknown as Parameters<typeof createMessageService>[0]['events'];

  const service = createMessageService({ read, write, events, now });

  const reset = () => {
    vi.restoreAllMocks();
  };

  return { service, read, write, events, reset };
};

const actor = { id: 'actor-id', role: 'user' as const };

describe('messageService.send', () => {
  const { service, read, write, events, reset } = createDeps();

  beforeEach(reset);

  test('creates message, publishes update and participant event', async () => {
    write.create = vi.fn(async () => 'created-id');
    read.findById = vi.fn(async () => baseMessage({ id: 'created-id' }));

    const id = await service.send({ input: { conversationId: 'conversation-id', senderId: 'sender-id', type: 'text', encryptedContent: 'SGVsbG8=' } }, actor);

    expect(id).toBe('created-id');
    expect(events.updateLastMessage).toHaveBeenCalledWith({ conversationId: 'conversation-id', messageId: 'created-id', preview: 'SGVsbG8=', occurredAt: '2025-10-02T00:00:00.000Z' });
    expect(events.publish).toHaveBeenCalledWith({ kind: 'MessageSent', conversationId: 'conversation-id', messageId: 'created-id', actorId: actor.id });
  });

  test('throws when message not found after creation', async () => {
    write.create = vi.fn(async () => 'created-id');
    read.findById = vi.fn(async () => null);

    await expect(
      service.send({ input: { conversationId: 'conversation-id', senderId: 'sender-id', type: 'text', encryptedContent: 'SGVsbG8=' } }, actor)
    ).rejects.toThrow('Message not found: created-id');
  });
});

describe('messageService.markRead', () => {
  const { service, write, reset } = createDeps();

  beforeEach(reset);

  test('no-op when ids empty', async () => {
    await service.markRead([]);
    expect(write.markAsRead).not.toHaveBeenCalled();
  });

  test('marks with default actor', async () => {
    await service.markRead(['a'], undefined, { id: 'custom', role: 'user' });
    expect(write.markAsRead).toHaveBeenCalledWith(['a'], now().toISOString(), { id: 'custom', role: 'user' });
  });
});

describe('messageService.updateStatus', () => {
  const { service, write, reset } = createDeps();

  beforeEach(reset);

  test('passes through to write port with timestamp', async () => {
    await service.updateStatus('message-id', 'delivered');
    expect(write.updateStatus).toHaveBeenCalledWith('message-id', 'delivered', now().toISOString());
  });
});

describe('messageService.softDelete', () => {
  const { service, read, write, events, reset } = createDeps();

  beforeEach(reset);

  test('soft deletes and updates last message', async () => {
    read.findById = vi.fn(async () => baseMessage());

    await service.softDelete('message-id');

    expect(write.softDelete).toHaveBeenCalledWith('message-id', now().toISOString(), { id: 'system', role: 'system' });
    expect(events.updateLastMessage).toHaveBeenCalledWith({ conversationId: 'conversation-id', messageId: 'message-id', preview: '', occurredAt: now().toISOString() });
  });

  test('throws when message missing', async () => {
    read.findById = vi.fn(async () => null);

    await expect(service.softDelete('missing-id')).rejects.toThrow('Message not found: missing-id');
  });
});


