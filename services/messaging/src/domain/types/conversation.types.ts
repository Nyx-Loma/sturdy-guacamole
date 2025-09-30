/**
 * Conversation domain types and validation schemas
 * 
 * This module defines conversation-related types with Zod schemas.
 * Conversations are containers for messages between multiple participants.
 */

import { z } from 'zod';

export const ConversationType = {
  DIRECT: 'direct',
  GROUP: 'group',
  CHANNEL: 'channel'
} as const;

export type ConversationType = typeof ConversationType[keyof typeof ConversationType];

export const ParticipantRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  OBSERVER: 'observer'
} as const;

export type ParticipantRole = typeof ParticipantRole[keyof typeof ParticipantRole];

const UUIDSchema = z.string().uuid();
const TimestampSchema = z.string().datetime();
const NameSchema = z.string().min(1).max(255);
const DescriptionSchema = z.string().max(1000);

export const ConversationTypeSchema = z.enum([
  ConversationType.DIRECT,
  ConversationType.GROUP,
  ConversationType.CHANNEL
]);

export const ParticipantRoleSchema = z.enum([
  ParticipantRole.OWNER,
  ParticipantRole.ADMIN,
  ParticipantRole.MEMBER,
  ParticipantRole.OBSERVER
]);

export const ParticipantSchema = z.object({
  userId: UUIDSchema,
  role: ParticipantRoleSchema,
  joinedAt: TimestampSchema,
  leftAt: TimestampSchema.optional(),
  lastReadAt: TimestampSchema.optional(),
  muted: z.boolean().default(false),
  mutedUntil: TimestampSchema.optional()
});

export type Participant = z.infer<typeof ParticipantSchema>;

export const ConversationSettingsSchema = z.object({
  whoCanAddParticipants: z.enum(['owner', 'admin', 'member']).default('admin'),
  whoCanSendMessages: z.enum(['owner', 'admin', 'member']).default('member'),
  messageRetentionDays: z.number().int().min(0).max(365).default(0),
  e2eeEnabled: z.boolean().default(true),
  maxParticipants: z.number().int().min(0).default(0)
});

export type ConversationSettings = z.infer<typeof ConversationSettingsSchema>;

export const ConversationMetadataSchema = z.record(z.unknown()).optional();
export type ConversationMetadata = z.infer<typeof ConversationMetadataSchema>;

export const ConversationSchema = z
  .object({
  id: UUIDSchema,
  type: ConversationTypeSchema,
  name: NameSchema.optional(),
  description: DescriptionSchema.optional(),
  avatarUrl: z.string().url().optional(),
  participants: z.array(ParticipantSchema).min(1),
  settings: ConversationSettingsSchema,
  metadata: ConversationMetadataSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  lastMessageId: UUIDSchema.optional(),
  lastMessageAt: TimestampSchema.optional(),
  lastMessagePreview: z.string().max(200).optional(),
  deletedAt: TimestampSchema.optional()
  })
  .superRefine((data, ctx) => {
    if (data.type === ConversationType.DIRECT) {
      if (data.participants.length !== 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Direct conversations require exactly 2 participants'
        });
      }
      if (data.name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Direct conversations cannot have a name'
        });
      }
      if (data.description) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Direct conversations cannot have a description'
        });
      }
    }
  });

export type Conversation = z.infer<typeof ConversationSchema>;

export const CreateConversationSchema = z.object({
  type: ConversationTypeSchema,
  name: NameSchema.optional(),
  description: DescriptionSchema.optional(),
  avatarUrl: z.string().url().optional(),
  participantIds: z.array(UUIDSchema).min(1),
  settings: ConversationSettingsSchema.optional(),
  metadata: ConversationMetadataSchema
}).superRefine((data, ctx) => {
  if (data.type === ConversationType.DIRECT && data.participantIds.length !== 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Direct conversations need exactly 2 participants' });
  }
  if (data.type === ConversationType.DIRECT && data.name) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Direct conversations cannot be named' });
  }
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

export const UpdateConversationSchema = z.object({
  id: UUIDSchema,
  name: NameSchema.optional(),
  description: DescriptionSchema.optional(),
  avatarUrl: z.string().url().optional(),
  settings: ConversationSettingsSchema.partial().optional(),
  metadata: ConversationMetadataSchema
});

export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;

export const ConversationQuerySchema = z.object({
  userId: UUIDSchema.optional(),
  type: ConversationTypeSchema.optional(),
  includeDeleted: z.boolean().default(false),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0)
});

export type ConversationQuery = z.infer<typeof ConversationQuerySchema>;
