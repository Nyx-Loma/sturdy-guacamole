import { z } from 'zod';

export const envelopeTypes = z.enum(['msg', 'typing', 'read', 'resume']);

const MsgPayloadSchema = z.object({
  seq: z.number().int().nonnegative(),
  data: z.any().optional()
});

const TypingPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  state: z.enum(['start', 'stop'])
});

const ReadPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  messageIds: z.array(z.string().uuid()).max(100)
});

const ResumePayloadSchemaInternal = z.object({
  resumeToken: z.string().uuid(),
  lastClientSeq: z.number().int().min(0)
});

const sharedFields = {
  v: z.literal(1),
  id: z.string().uuid(),
  size: z.number().int().positive().lte(64 * 1024)
};

const MsgEnvelopeSchema = z.object({
  ...sharedFields,
  type: z.literal('msg'),
  payload: MsgPayloadSchema
});

const TypingEnvelopeSchema = z.object({
  ...sharedFields,
  type: z.literal('typing'),
  payload: TypingPayloadSchema
});

const ReadEnvelopeSchema = z.object({
  ...sharedFields,
  type: z.literal('read'),
  payload: ReadPayloadSchema
});

const ResumeEnvelopeSchema = z.object({
  ...sharedFields,
  type: z.literal('resume'),
  payload: ResumePayloadSchemaInternal
});

export const MessageEnvelopeSchema = z.discriminatedUnion('type', [
  MsgEnvelopeSchema,
  TypingEnvelopeSchema,
  ReadEnvelopeSchema,
  ResumeEnvelopeSchema
]);

export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;

export const ResumePayloadSchema = ResumePayloadSchemaInternal;
