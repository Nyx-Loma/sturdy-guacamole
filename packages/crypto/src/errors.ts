export class CryptoError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

export class RatchetError extends CryptoError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = 'RatchetError';
  }
}

export class SkippedMessageLimitExceededError extends RatchetError {
  constructor(limit: number) {
    super(`Skipped message limit of ${limit} exceeded`, 'SKIPPED_MESSAGE_LIMIT_EXCEEDED');
    this.name = 'SkippedMessageLimitExceededError';
  }
}

export class ReplayError extends RatchetError {
  constructor() {
    super('header counter already processed', 'REPLAY');
    this.name = 'ReplayError';
  }
}

export const skippedMessageLimitExceeded = (limit: number) => new SkippedMessageLimitExceededError(limit);

