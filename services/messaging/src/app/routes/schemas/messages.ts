import { z } from 'zod';
import { MessageSchema, MessageStatusSchema, MessageTypeSchema } from '../../../domain/types/message.types';

const Uuid = z.string().uuid();
const IsoDateTime = z.string().datetime();
const Base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);

export const SendMessageHeadersSchema = z.object({
  'idempotency-key': z.string().min(8).max(128).optional()
});

export const SendMessageBodySchema = z.object({
  conversationId: Uuid,
  senderId: Uuid,
  type: MessageTypeSchema,
  encryptedContent: Base64,
  contentMimeType: z.string().optional(),
  payloadSizeBytes: z.number().int().positive().max(256 * 1024),
  metadata: z.record(z.unknown()).optional(),
  clientId: z.string().optional()
});

export const SendMessageRequestSchema = z.object({
  headers: SendMessageHeadersSchema,
  body: SendMessageBodySchema
});

export const SendMessageResponseSchema = z.object({
  status: z.union([z.literal(200), z.literal(201)]),
  message: MessageSchema
});

export const GetMessageParamsSchema = z.object({ messageId: Uuid });

export const ListMessagesParamsSchema = z.object({ conversationId: Uuid });

export const ListMessagesQuerySchema = z.object({
  senderId: Uuid.optional(),
  status: MessageStatusSchema.optional(),
  type: MessageTypeSchema.optional(),
  before: IsoDateTime.optional(),
  after: IsoDateTime.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  includeDeleted: z.coerce.boolean().optional()
});

export const ListMessagesResponseSchema = z.object({
  items: z.array(MessageSchema),
  nextCursor: z.string().optional()
});

export const MarkReadRequestSchema = z.object({
  messageIds: z.array(Uuid),
  readAt: IsoDateTime.optional()
});

export const MarkReadResponseSchema = z.object({ updated: z.number().int().nonnegative() });


