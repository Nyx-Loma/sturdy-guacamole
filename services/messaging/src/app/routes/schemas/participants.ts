import { z } from "zod";

// ============================================================================
// POST /v1/conversations/:id/participants - Add participant
// ============================================================================

export const AddParticipantParamsSchema = z.object({
  conversationId: z.string().uuid(),
});

export const AddParticipantBodySchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["member", "admin"]).default("member"),
});

export const AddParticipantResponseSchema = z.object({
  participant: z.object({
    userId: z.string().uuid(),
    role: z.enum(["member", "admin"]),
    joinedAt: z.string().datetime(),
    leftAt: z.string().datetime().nullable(),
  }),
});

// ============================================================================
// DELETE /v1/conversations/:id/participants/:userId - Remove participant
// ============================================================================

export const RemoveParticipantParamsSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const RemoveParticipantResponseSchema = z.object({
  removed: z.boolean(),
  leftAt: z.string().datetime(),
});

// ============================================================================
// GET /v1/conversations/:id/participants - List participants
// ============================================================================

export const ListParticipantsParamsSchema = z.object({
  conversationId: z.string().uuid(),
});

export const ListParticipantsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  cursor: z.string().optional(),
  includeLeft: z.coerce.boolean().default(false),
});

export const ListParticipantsResponseSchema = z.object({
  participants: z.array(z.object({
    userId: z.string().uuid(),
    role: z.enum(["member", "admin"]),
    joinedAt: z.string().datetime(),
    leftAt: z.string().datetime().nullable(),
  })),
  nextCursor: z.string().nullable(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type AddParticipantParams = z.infer<typeof AddParticipantParamsSchema>;
export type AddParticipantBody = z.infer<typeof AddParticipantBodySchema>;
export type AddParticipantResponse = z.infer<typeof AddParticipantResponseSchema>;

export type RemoveParticipantParams = z.infer<typeof RemoveParticipantParamsSchema>;
export type RemoveParticipantResponse = z.infer<typeof RemoveParticipantResponseSchema>;

export type ListParticipantsParams = z.infer<typeof ListParticipantsParamsSchema>;
export type ListParticipantsQuery = z.infer<typeof ListParticipantsQuerySchema>;
export type ListParticipantsResponse = z.infer<typeof ListParticipantsResponseSchema>;

