import { describe, it, expect } from 'vitest';
import {
  AddParticipantBodySchema,
  AddParticipantParamsSchema,
  ListParticipantsParamsSchema,
  ListParticipantsQuerySchema,
  RemoveParticipantParamsSchema,
  ListParticipantsResponseSchema,
} from '../../../../app/routes/schemas/participants';

const uuid = (x: number) => `${x}${x}${x}${x}${x}${x}${x}${x}-${x}${x}${x}${x}-${x}${x}${x}${x}-${x}${x}${x}${x}-${x}${x}${x}${x}${x}${x}${x}${x}${x}${x}${x}${x}`;

describe('participant schemas', () => {
  it('validates add participant payload', () => {
    const params = AddParticipantParamsSchema.parse({ conversationId: uuid(1) });
    expect(params.conversationId).toBe(uuid(1));

    const body = AddParticipantBodySchema.parse({ userId: uuid(2), role: 'member' });
    expect(body.role).toBe('member');
  });

  it('rejects invalid role', () => {
    expect(() =>
      AddParticipantBodySchema.parse({ userId: uuid(3), role: 'owner' })
    ).toThrow();
  });

  it('validates list participants query defaults', () => {
    const params = ListParticipantsParamsSchema.parse({ conversationId: uuid(4) });
    expect(params.conversationId).toBe(uuid(4));

    const query = ListParticipantsQuerySchema.parse({});
    expect(query.limit).toBe(100);
    expect(query.includeLeft).toBe(false);
  });

  it('validates response envelope', () => {
    const parsed = ListParticipantsResponseSchema.parse({
      participants: [
        {
          userId: uuid(5),
          role: 'admin',
          joinedAt: new Date().toISOString(),
          leftAt: null,
        },
      ],
      nextCursor: null,
    });

    expect(parsed.participants[0].role).toBe('admin');
  });

  it('validates remove participant params', () => {
    const params = RemoveParticipantParamsSchema.parse({ conversationId: uuid(6), userId: uuid(7) });
    expect(params.userId).toBe(uuid(7));
  });
});
