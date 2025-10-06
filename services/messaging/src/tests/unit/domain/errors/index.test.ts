import { describe, it, expect } from 'vitest';
import {
  MessagingError,
  MessageNotFoundError,
  ConversationNotFoundError,
  NotAParticipantError,
  InsufficientPermissionsError,
  ConversationFullError,
  InvalidConversationTypeError,
  EncryptionError,
  MessageTooLargeError,
  PayloadValidationError,
  DuplicateMessageError,
  RateLimitExceededError,
  ValidationError,
} from '../../../../app/../../src/domain/errors';

describe('messaging domain errors', () => {
  it('MessagingError exposes code and status', () => {
    const err = new MessagingError('boom', 'X', 501);
    expect(err.name).toBe('MessagingError');
    expect(err.code).toBe('X');
    expect(err.statusCode).toBe(501);
    expect(err.message).toContain('boom');
  });

  it('MessageNotFoundError formats message and status 404', () => {
    const err = new MessageNotFoundError('m1');
    expect(err.code).toBe('MESSAGE_NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('m1');
  });

  it('ConversationNotFoundError formats message and status 404', () => {
    const err = new ConversationNotFoundError('c1');
    expect(err.code).toBe('CONVERSATION_NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('c1');
  });

  it('NotAParticipantError formats message and status 403', () => {
    const err = new NotAParticipantError('u1', 'c1');
    expect(err.code).toBe('NOT_A_PARTICIPANT');
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain('u1');
    expect(err.message).toContain('c1');
  });

  it('InsufficientPermissionsError sets code and status 403', () => {
    const err = new InsufficientPermissionsError('write', 'admin');
    expect(err.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain('write');
    expect(err.message).toContain('admin');
  });

  it('ConversationFullError sets code and status 400', () => {
    const err = new ConversationFullError('c2', 10);
    expect(err.code).toBe('CONVERSATION_FULL');
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('c2');
    expect(err.message).toContain('10');
  });

  it('InvalidConversationTypeError sets code and status 400', () => {
    const err = new InvalidConversationTypeError('add', 'direct', 'group');
    expect(err.code).toBe('INVALID_CONVERSATION_TYPE');
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('direct');
    expect(err.message).toContain('group');
  });

  it('EncryptionError sets code and status 500', () => {
    const err = new EncryptionError('bad key');
    expect(err.code).toBe('ENCRYPTION_ERROR');
    expect(err.statusCode).toBe(500);
    expect(err.message).toContain('bad key');
  });

  it('MessageTooLargeError sets code and status 413', () => {
    const err = new MessageTooLargeError(2000000, 1000000);
    expect(err.code).toBe('MESSAGE_TOO_LARGE');
    expect(err.statusCode).toBe(413);
    expect(err.message).toContain('2000000');
    expect(err.message).toContain('1000000');
  });

  it('PayloadValidationError defaults to 400 and uses PAYLOAD_INVALID code', () => {
    const err = new PayloadValidationError('bad');
    expect(err.code).toBe('PAYLOAD_INVALID');
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('bad');
  });

  it('DuplicateMessageError sets code and status 409', () => {
    const err = new DuplicateMessageError('client-1');
    expect(err.code).toBe('DUPLICATE_MESSAGE');
    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('client-1');
  });

  it('RateLimitExceededError sets code and status 429', () => {
    const err = new RateLimitExceededError('send', 5);
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(err.statusCode).toBe(429);
    expect(err.message).toContain('send');
  });

  it('ValidationError sets code and status 400', () => {
    const err = new ValidationError('id', 'uuid');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('id');
    expect(err.message).toContain('uuid');
  });
});
