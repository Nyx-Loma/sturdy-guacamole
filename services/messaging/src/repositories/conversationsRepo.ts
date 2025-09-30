/**
 * Conversations Repository Interface
 * 
 * Defines the contract for conversation persistence operations.
 * Handles conversations and their participants.
 */

import type {
  Conversation,
  CreateConversationInput,
  ConversationQuery,
  ConversationSettings,
  Participant
} from '../domain/types';

/**
 * Repository interface for conversation operations
 */
export interface ConversationsRepository {
  /**
   * Create a new conversation
   * @param input - Conversation creation data
   * @param creatorId - ID of the user creating the conversation
   * @returns The created conversation with generated ID and timestamps
   */
  create(
    input: CreateConversationInput,
    creatorId: string
  ): Promise<Conversation>;

  /**
   * Find a conversation by its ID
   * @param id - Conversation UUID
   * @returns The conversation if found, null otherwise
   */
  findById(id: string): Promise<Conversation | null>;

  /**
   * Find conversations where a user is a participant
   * @param userId - User UUID
   * @param query - Query parameters (filters, pagination)
   * @returns Array of conversations matching the criteria
   */
  findByParticipant(
    userId: string,
    query?: ConversationQuery
  ): Promise<Conversation[]>;

  /**
   * Find a direct conversation between two users
   * @param userId1 - First user UUID
   * @param userId2 - Second user UUID
   * @returns The direct conversation if it exists, null otherwise
   */
  findDirectConversation(
    userId1: string,
    userId2: string
  ): Promise<Conversation | null>;

  /**
   * Update conversation's last message information
   * @param conversationId - Conversation UUID
   * @param messageId - ID of the latest message
   * @param preview - Preview text from the message
   * @param timestamp - Message timestamp
   */
  updateLastMessage(
    conversationId: string,
    messageId: string,
    preview: string,
    timestamp: string
  ): Promise<void>;

  /**
   * Add participants to a conversation
   * @param conversationId - Conversation UUID
   * @param participants - Array of participants to add
   */
  addParticipants(
    conversationId: string,
    participants: Participant[]
  ): Promise<void>;

  /**
   * Remove a participant from a conversation
   * @param conversationId - Conversation UUID
   * @param userId - User UUID to remove
   * @param leftAt - Timestamp when the user left
   */
  removeParticipant(
    conversationId: string,
    userId: string,
    leftAt: string
  ): Promise<void>;

  /**
   * Update a participant's role
   * @param conversationId - Conversation UUID
   * @param userId - User UUID
   * @param role - New role for the participant
   */
  updateParticipantRole(
    conversationId: string,
    userId: string,
    role: string
  ): Promise<void>;

  /**
   * Update participant's last read timestamp
   * @param conversationId - Conversation UUID
   * @param userId - User UUID
   * @param lastReadAt - Timestamp of last read
   */
  updateLastRead(
    conversationId: string,
    userId: string,
    lastReadAt: string
  ): Promise<void>;

  /**
   * Update conversation settings
   * @param conversationId - Conversation UUID
   * @param settings - Partial settings to update
   */
  updateSettings(
    conversationId: string,
    settings: Partial<ConversationSettings>
  ): Promise<void>;

  /**
   * Update conversation metadata
   * @param conversationId - Conversation UUID
   * @param name - Optional new name
   * @param description - Optional new description
   * @param avatarUrl - Optional new avatar URL
   */
  updateMetadata(
    conversationId: string,
    updates: {
      name?: string;
      description?: string;
      avatarUrl?: string;
    }
  ): Promise<void>;

  /**
   * Soft delete a conversation
   * @param conversationId - Conversation UUID
   * @param deletedAt - Deletion timestamp
   */
  softDelete(conversationId: string, deletedAt: string): Promise<void>;

  /**
   * Check if a user is a participant in a conversation
   * @param conversationId - Conversation UUID
   * @param userId - User UUID
   * @returns True if user is a participant, false otherwise
   */
  isParticipant(conversationId: string, userId: string): Promise<boolean>;

  /**
   * Get participant's role in a conversation
   * @param conversationId - Conversation UUID
   * @param userId - User UUID
   * @returns The participant's role, or null if not a participant
   */
  getParticipantRole(
    conversationId: string,
    userId: string
  ): Promise<string | null>;

  /**
   * Delete a conversation and all related data (for testing/cleanup)
   * @param conversationId - Conversation UUID
   */
  delete(conversationId: string): Promise<void>;
}
