import { z } from "zod";

// ============================================================================
// Request Schemas
// ============================================================================

export const CreateConversationHeadersSchema = z.object({
  "x-device-id": z.string().optional(),
  "x-session-id": z.string().optional(),
  "idempotency-key": z.string().optional(),
});

export const CreateConversationBodySchema = z.object({
  type: z.enum(["direct", "group", "channel"]),
  participants: z.array(z.string().uuid()).min(1).max(1000),
  metadata: z.object({
    name: z.string().optional(),
    avatar: z.string().url().optional(),
    description: z.string().optional(),
    custom: z.record(z.unknown()).optional(),
  }).optional().default({}),
});

export const CreateConversationRequestSchema = z.object({
  headers: CreateConversationHeadersSchema,
  body: CreateConversationBodySchema,
});

// ============================================================================
// Response Schemas
// ============================================================================

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["direct", "group", "channel"]),
  creatorId: z.string().uuid(),
  metadata: z.object({
    name: z.string().optional(),
    avatar: z.string().url().optional(),
    description: z.string().optional(),
    custom: z.record(z.unknown()).optional(),
  }),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const ParticipantSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["member", "admin"]),
  joinedAt: z.string().datetime(),
  leftAt: z.string().datetime().nullable(),
});

export const CreateConversationResponseSchema = z.object({
  conversation: ConversationSchema,
  participants: z.array(ParticipantSchema),
  isReplay: z.boolean().optional(),
});

// ============================================================================
// GET /v1/conversations/:id
// ============================================================================

export const GetConversationParamsSchema = z.object({
  id: z.string().uuid(),
});

export const GetConversationResponseSchema = z.object({
  conversation: ConversationSchema,
  participants: z.array(ParticipantSchema),
});

// ============================================================================
// PATCH /v1/conversations/:id
// ============================================================================

export const UpdateConversationParamsSchema = z.object({
  id: z.string().uuid(),
});

export const UpdateConversationHeadersSchema = z.object({
  "if-match": z.string().optional(),
});

export const UpdateConversationBodySchema = z.object({
  metadata: z.object({
    name: z.string().optional(),
    avatar: z.string().url().optional(),
    description: z.string().optional(),
    custom: z.record(z.unknown()).optional(),
  }),
});

export const UpdateConversationRequestSchema = z.object({
  params: UpdateConversationParamsSchema,
  headers: UpdateConversationHeadersSchema,
  body: UpdateConversationBodySchema,
});

export const UpdateConversationResponseSchema = z.object({
  conversation: ConversationSchema,
});

// ============================================================================
// DELETE /v1/conversations/:id
// ============================================================================

export const DeleteConversationParamsSchema = z.object({
  id: z.string().uuid(),
});

export const DeleteConversationResponseSchema = z.object({
  deleted: z.boolean(),
  deletedAt: z.string().datetime(),
});

// ============================================================================
// GET /v1/conversations (list)
// ============================================================================

export const ListConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationSchema),
  nextCursor: z.string().nullable(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type CreateConversationHeaders = z.infer<typeof CreateConversationHeadersSchema>;
export type CreateConversationBody = z.infer<typeof CreateConversationBodySchema>;
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
export type CreateConversationResponse = z.infer<typeof CreateConversationResponseSchema>;

export type GetConversationParams = z.infer<typeof GetConversationParamsSchema>;
export type GetConversationResponse = z.infer<typeof GetConversationResponseSchema>;

export type UpdateConversationParams = z.infer<typeof UpdateConversationParamsSchema>;
export type UpdateConversationHeaders = z.infer<typeof UpdateConversationHeadersSchema>;
export type UpdateConversationBody = z.infer<typeof UpdateConversationBodySchema>;
export type UpdateConversationRequest = z.infer<typeof UpdateConversationRequestSchema>;
export type UpdateConversationResponse = z.infer<typeof UpdateConversationResponseSchema>;

export type DeleteConversationParams = z.infer<typeof DeleteConversationParamsSchema>;
export type DeleteConversationResponse = z.infer<typeof DeleteConversationResponseSchema>;

export type ListConversationsQuery = z.infer<typeof ListConversationsQuerySchema>;
export type ListConversationsResponse = z.infer<typeof ListConversationsResponseSchema>;

export type Conversation = z.infer<typeof ConversationSchema>;
export type Participant = z.infer<typeof ParticipantSchema>;

