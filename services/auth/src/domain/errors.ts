export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends AuthError {
  constructor(message = 'rate limit exceeded') {
    super(message, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}

export class InvalidSignatureError extends AuthError {
  constructor(message = 'invalid device signature') {
    super(message, 'INVALID_SIGNATURE');
    this.name = 'InvalidSignatureError';
  }
}

export class ExpiredPairingError extends AuthError {
  constructor(message = 'pairing token expired') {
    super(message, 'EXPIRED_PAIRING');
    this.name = 'ExpiredPairingError';
  }
}

export class NotFoundError extends AuthError {
  constructor(message = 'resource not found') {
    super(message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class CaptchaRequiredError extends AuthError {
  constructor(message = 'captcha challenge required') {
    super(message, 'CAPTCHA_REQUIRED');
    this.name = 'CaptchaRequiredError';
  }
}

export class ExpiredTokenError extends AuthError {
  constructor(message = 'token expired') {
    super(message, 'TOKEN_EXPIRED');
    this.name = 'ExpiredTokenError';
  }
}

export class DeviceLimitExceededError extends AuthError {
  constructor(message = 'device limit exceeded for account') {
    super(message, 'DEVICE_LIMIT');
    this.name = 'DeviceLimitExceededError';
  }
}

export class InvalidRecoveryCodeError extends AuthError {
  constructor(message = 'invalid recovery code') {
    super(message, 'INVALID_RECOVERY_CODE');
    this.name = 'InvalidRecoveryCodeError';
  }
}


