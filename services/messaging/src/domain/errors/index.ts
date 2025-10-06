/**
 * Messaging domain errors
 * 
 * Custom error types for the messaging domain with proper categorization
 * and error codes for client handling.
 */

/**
 * Base error class for messaging domain
 */
export class MessagingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'MessagingError';
    Object.setPrototypeOf(this, MessagingError.prototype);
  }
}

/**
 * Message not found
 */
export class MessageNotFoundError extends MessagingError {
  constructor(messageId: string) {
    super(
      `Message not found: ${messageId}`,
      'MESSAGE_NOT_FOUND',
      404
    );
    this.name = 'MessageNotFoundError';
  }
}

/**
 * Conversation not found
 */
export class ConversationNotFoundError extends MessagingError {
  constructor(conversationId: string) {
    super(
      `Conversation not found: ${conversationId}`,
      'CONVERSATION_NOT_FOUND',
      404
    );
    this.name = 'ConversationNotFoundError';
  }
}

/**
 * User is not a participant in the conversation
 */
export class NotAParticipantError extends MessagingError {
  constructor(userId: string, conversationId: string) {
    super(
      `User ${userId} is not a participant in conversation ${conversationId}`,
      'NOT_A_PARTICIPANT',
      403
    );
    this.name = 'NotAParticipantError';
  }
}


/**
 * User lacks required permissions
 */
export class InsufficientPermissionsError extends MessagingError {
  constructor(action: string, requiredRole: string) {
    super(
      `Insufficient permissions to ${action}. Required role: ${requiredRole}`,
      'INSUFFICIENT_PERMISSIONS',
      403
    );
    this.name = 'InsufficientPermissionsError';
  }
}

/**
 * Conversation is full (max participants reached)
 */
export class ConversationFullError extends MessagingError {
  constructor(conversationId: string, maxParticipants: number) {
    super(
      `Conversation ${conversationId} is full (max: ${maxParticipants} participants)`,
      'CONVERSATION_FULL',
      400
    );
    this.name = 'ConversationFullError';
  }
}

/**
 * Invalid conversation type for operation
 */
export class InvalidConversationTypeError extends MessagingError {
  constructor(operation: string, actualType: string, expectedType: string) {
    super(
      `Cannot ${operation} on ${actualType} conversation. Expected: ${expectedType}`,
      'INVALID_CONVERSATION_TYPE',
      400
    );
    this.name = 'InvalidConversationTypeError';
  }
}

/**
 * Message encryption/decryption failed
 */
export class EncryptionError extends MessagingError {
  constructor(reason: string) {
    super(
      `Encryption error: ${reason}`,
      'ENCRYPTION_ERROR',
      500
    );
    this.name = 'EncryptionError';
  }
}

/**
 * Message is too large
 */
export class MessageTooLargeError extends MessagingError {
  constructor(size: number, maxSize: number) {
    super(
      `Message size ${size} bytes exceeds maximum of ${maxSize} bytes`,
      'MESSAGE_TOO_LARGE',
      413
    );
    this.name = 'MessageTooLargeError';
  }
}

export class PayloadValidationError extends MessagingError {
  constructor(reason: string, statusCode = 400) {
    super(`Invalid payload: ${reason}`, 'PAYLOAD_INVALID', statusCode);
    this.name = 'PayloadValidationError';
  }
}

/**
 * Duplicate message (idempotency check failed)
 */
export class DuplicateMessageError extends MessagingError {
  constructor(clientId: string) {
    super(
      `Message with client ID ${clientId} already exists`,
      'DUPLICATE_MESSAGE',
      409
    );
    this.name = 'DuplicateMessageError';
  }
}

/**
 * Rate limit exceeded
 */
export class RateLimitExceededError extends MessagingError {
  constructor(action: string, retryAfter: number) {
    super(
      `Rate limit exceeded for ${action}. Retry after ${retryAfter} seconds`,
      'RATE_LIMIT_EXCEEDED',
      429
    );
    this.name = 'RateLimitExceededError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends MessagingError {
  constructor(field: string, reason: string) {
    super(
      `Validation error for ${field}: ${reason}`,
      'VALIDATION_ERROR',
      400
    );
    this.name = 'ValidationError';
  }
}
