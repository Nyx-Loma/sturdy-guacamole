/**
 * Messages Repository Interface
 * 
 * Defines the contract for message persistence operations.
 * Implementations can use in-memory storage, Postgres, or other backends.
 */

import type {
  Message,
  CreateMessageInput,
  MessageStatus,
  MessageQuery
} from '../domain/types';

/**
 * Repository interface for message operations
 */
export interface MessagesRepository {
  /**
   * Create a new message
   * @param input - Message creation data
   * @returns The created message with generated ID and timestamps
   */
  create(input: CreateMessageInput): Promise<Message>;

  /**
   * Find a message by its ID
   * @param id - Message UUID
   * @returns The message if found, null otherwise
   */
  findById(id: string): Promise<Message | null>;

  /**
   * Find messages in a conversation with optional filtering
   * @param conversationId - Conversation UUID
   * @param query - Query parameters (filters, pagination)
   * @returns Array of messages matching the criteria
   */
  findByConversation(
    conversationId: string,
    query?: MessageQuery
  ): Promise<Message[]>;

  /**
   * Find a message by client ID (for idempotency)
   * @param clientId - Client-provided unique identifier
   * @param senderId - Sender's user ID for additional verification
   * @returns The message if found, null otherwise
   */
  findByClientId(clientId: string, senderId: string): Promise<Message | null>;

  /**
   * Update message status
   * @param id - Message UUID
   * @param status - New message status
   * @param timestamp - Timestamp for the status change
   */
  updateStatus(
    id: string,
    status: MessageStatus,
    timestamp: string
  ): Promise<void>;

  /**
   * Soft delete a message
   * @param id - Message UUID
   * @param deletedAt - Deletion timestamp
   */
  softDelete(id: string, deletedAt: string): Promise<void>;

  /**
   * Count messages in a conversation
   * @param conversationId - Conversation UUID
   * @param includeDeleted - Whether to include soft-deleted messages
   * @returns Number of messages
   */
  countByConversation(
    conversationId: string,
    includeDeleted?: boolean
  ): Promise<number>;

  /**
   * Get the latest message in a conversation
   * @param conversationId - Conversation UUID
   * @returns The most recent message, or null if no messages exist
   */
  getLatestByConversation(conversationId: string): Promise<Message | null>;

  /**
   * Mark multiple messages as read
   * @param messageIds - Array of message UUIDs
   * @param readAt - Timestamp when messages were read
   */
  markAsRead(messageIds: string[], readAt: string): Promise<void>;

  /**
   * Delete all messages in a conversation (for testing/cleanup)
   * @param conversationId - Conversation UUID
   */
  deleteByConversation(conversationId: string): Promise<void>;
}


