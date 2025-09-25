import { describe, expect, it } from 'vitest';
import { MessageEnvelopeSchema } from '../src/schemas';

const baseEnvelope = {
  v: 1,
  id: '9d7b1b5c-5e15-4b92-a2e2-7f0d6ffd1fd1',
  size: 42
};

describe('MessageEnvelopeSchema', () => {
  it('accepts msg payloads with seq', () => {
    const parsed = MessageEnvelopeSchema.parse({
      ...baseEnvelope,
      type: 'msg',
      payload: { seq: 0, data: { hello: 'world' } }
    });
    expect(parsed.payload).toEqual({ seq: 0, data: { hello: 'world' } });
  });

  it('rejects msg payloads missing seq', () => {
    expect(() =>
      MessageEnvelopeSchema.parse({
        ...baseEnvelope,
        type: 'msg',
        payload: {}
      })
    ).toThrowError();
  });

  it('accepts typing payloads with valid state', () => {
    const parsed = MessageEnvelopeSchema.parse({
      ...baseEnvelope,
      type: 'typing',
      payload: { conversationId: '7f09291c-9b40-4b88-97dd-94a51250d0c4', state: 'start' }
    });
    expect(parsed.payload.state).toBe('start');
  });

  it('rejects typing payloads with invalid state', () => {
    expect(() =>
      MessageEnvelopeSchema.parse({
        ...baseEnvelope,
        type: 'typing',
        payload: { conversationId: '7f09291c-9b40-4b88-97dd-94a51250d0c4', state: 'pause' }
      })
    ).toThrowError();
  });

  it('accepts read payloads with message ids', () => {
    const parsed = MessageEnvelopeSchema.parse({
      ...baseEnvelope,
      type: 'read',
      payload: {
        conversationId: '7f09291c-9b40-4b88-97dd-94a51250d0c4',
        messageIds: ['2d0c2ec2-446d-4dcb-bdc6-0f9b1d895f95']
      }
    });
    expect(parsed.payload.messageIds).toHaveLength(1);
  });

  it('rejects read payloads with too many ids', () => {
    expect(() =>
      MessageEnvelopeSchema.parse({
        ...baseEnvelope,
        type: 'read',
        payload: {
          conversationId: '7f09291c-9b40-4b88-97dd-94a51250d0c4',
          messageIds: Array.from({ length: 101 }, () => '2d0c2ec2-446d-4dcb-bdc6-0f9b1d895f95')
        }
      })
    ).toThrowError();
  });

  it('accepts resume payloads', () => {
    const parsed = MessageEnvelopeSchema.parse({
      ...baseEnvelope,
      type: 'resume',
      payload: {
        resumeToken: 'f13c2c9e-60a7-4e0d-b8f8-d2bbf35a1bdd',
        lastClientSeq: 5
      }
    });
    expect(parsed.payload.resumeToken).toMatch(/[0-9a-f-]{36}/i);
  });
});
