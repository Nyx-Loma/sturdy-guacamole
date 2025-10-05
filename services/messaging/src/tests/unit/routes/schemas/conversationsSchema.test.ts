import { describe, it, expect } from 'vitest';
import {
  CreateConversationBodySchema,
  CreateConversationHeadersSchema,
  ListConversationsQuerySchema,
  UpdateConversationBodySchema,
  CreateConversationResponseSchema,
} from '../../../../app/routes/schemas/conversations';

const iso = () => new Date().toISOString();

describe('conversation schemas', () => {
  it('validates direct conversation payload', () => {
    const headers = CreateConversationHeadersSchema.parse({
      'x-device-id': '11111111-1111-1111-1111-111111111111',
      'idempotency-key': 'abc-123',
    });
    expect(headers['x-device-id']).toBeTruthy();

    const body = CreateConversationBodySchema.parse({
      type: 'direct',
      participants: [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ],
      metadata: { name: 'DM' },
    });
    expect(body.type).toBe('direct');
    expect(body.metadata?.name).toBe('DM');
  });

  it('allows handler-level validation for direct participant count', () => {
    const parsed = CreateConversationBodySchema.parse({
      type: 'direct',
      participants: ['11111111-1111-1111-1111-111111111111'],
    });
    expect(parsed.participants).toHaveLength(1);
  });

  it('coerces pagination defaults and validates cursor', () => {
    const parsed = ListConversationsQuerySchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.cursor).toBeUndefined();

    expect(() =>
      ListConversationsQuerySchema.parse({ cursor: 'not-a-valid-cursor' })
    ).not.toThrow(); // schema only checks string; cursor is validated at handler level
  });

  it('validates update metadata payload', () => {
    expect(() =>
      UpdateConversationBodySchema.parse({
        metadata: { name: 'New Name', custom: { theme: 'dark' } },
      })
    ).not.toThrow();

    expect(() =>
      UpdateConversationBodySchema.parse({ metadata: { avatar: 'invalid-url' } })
    ).toThrow();
  });

  it('validates conversation response envelope', () => {
    const response = CreateConversationResponseSchema.parse({
      conversation: {
        id: '33333333-3333-3333-3333-333333333333',
        type: 'group',
        creatorId: '11111111-1111-1111-1111-111111111111',
        metadata: { name: 'Group Chat' },
        version: 1,
        createdAt: iso(),
        updatedAt: iso(),
        deletedAt: null,
      },
      participants: [
        {
          userId: '11111111-1111-1111-1111-111111111111',
          role: 'admin',
          joinedAt: iso(),
          leftAt: null,
        },
      ],
      isReplay: false,
    });

    expect(response.conversation.metadata.name).toBe('Group Chat');
  });
});
