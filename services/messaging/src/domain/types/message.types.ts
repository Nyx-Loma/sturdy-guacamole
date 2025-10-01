/**
 * Message domain types and validation schemas
 * 
 * This module defines all message-related types with Zod schemas for runtime validation.
 * Messages are the core entity in the messaging service, representing encrypted
 * communications between users.
 */

import { z } from 'zod';

/**
 * Message status lifecycle
 */
export const MessageStatus = {
  PENDING: 'pending',     // Awaiting delivery
  SENT: 'sent',           // Successfully sent to server
  DELIVERED: 'delivered', // Delivered to recipient's device
  READ: 'read',           // Read by recipient
  FAILED: 'failed'        // Failed to deliver
} as const;

export type MessageStatus = typeof MessageStatus[keyof typeof MessageStatus];

/**
 * Message content types
 */
export const MessageType = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  FILE: 'file',
  SYSTEM: 'system' // System-generated messages (e.g., "User joined")
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

/**
 * Zod schema for message status
 */
export const MessageStatusSchema = z.enum([
  MessageStatus.PENDING,
  MessageStatus.SENT,
  MessageStatus.DELIVERED,
  MessageStatus.READ,
  MessageStatus.FAILED
]);

/**
 * Zod schema for message type
 */
export const MessageTypeSchema = z.enum([
  MessageType.TEXT,
  MessageType.IMAGE,
  MessageType.VIDEO,
  MessageType.AUDIO,
  MessageType.FILE,
  MessageType.SYSTEM
]);

/**
 * UUID validation schema
 */
const UUIDSchema = z.string().uuid();

/**
 * ISO 8601 timestamp schema
 */
const TimestampSchema = z.string().datetime();

/**
 * Base64 encoded string (for encrypted content)
 */
const Base64Schema = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);

/**
 * Message metadata (extensible JSON object)
 */
export const MessageMetadataSchema = z.record(z.unknown()).optional();

export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

/**
 * Core message data structure
 */
export const MessageSchema = z.object({
  id: UUIDSchema,
  conversationId: UUIDSchema,
  senderId: UUIDSchema,
  type: MessageTypeSchema,
  status: MessageStatusSchema,
  
  // Encrypted message content (E2EE)
  encryptedContent: Base64Schema,
  
  // Content metadata (size, mime type, etc.)
  contentSize: z.number().int().positive().optional(),
  contentMimeType: z.string().optional(),
  
  // Message metadata (reply-to, mentions, etc.)
  metadata: MessageMetadataSchema,
  
  // Timestamps
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  deliveredAt: TimestampSchema.optional(),
  readAt: TimestampSchema.optional(),
  
  // Soft delete
  deletedAt: TimestampSchema.optional()
});

export type Message = z.infer<typeof MessageSchema>;

/**
 * Schema for creating a new message
 */
export const CreateMessageSchema = MessageSchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deliveredAt: true,
  readAt: true,
  deletedAt: true
}).extend({
  // Optional client-provided ID for idempotency
  clientId: z.string().optional()
});

export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;

/**
 * Schema for updating message status
 */
export const UpdateMessageStatusSchema = z.object({
  id: UUIDSchema,
  status: MessageStatusSchema,
  timestamp: TimestampSchema
});

export type UpdateMessageStatusInput = z.infer<typeof UpdateMessageStatusSchema>;

/**
 * Message query filters
 */
export const MessageQuerySchema = z.object({
  conversationId: UUIDSchema.optional(),
  senderId: UUIDSchema.optional(),
  status: MessageStatusSchema.optional(),
  type: MessageTypeSchema.optional(),
  before: TimestampSchema.optional(), // Pagination: messages before this time
  after: TimestampSchema.optional(),  // Pagination: messages after this time
  limit: z.number().int().positive().max(100).default(50),
  includeDeleted: z.boolean().default(false)
});

export type MessageQuery = z.infer<typeof MessageQuerySchema>;


