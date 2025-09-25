import { z } from 'zod';

export const envelopeTypes = z.enum(['msg', 'typing', 'read', 'resume']);

export const MessageEnvelopeSchema = z
  .object({
    v: z.literal(1),
    id: z.string().uuid(),
    type: envelopeTypes,
    payload: z.unknown(),
    size: z.number().int().positive().lte(64 * 1024)
  })
  .strip();

export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;

export const ResumePayloadSchema = z.object({
  resumeToken: z.string().uuid(),
  lastClientSeq: z.number().int().min(0)
});
