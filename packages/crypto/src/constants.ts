const encoder = new TextEncoder();

export const INFO_DH = encoder.encode('curly-spork dh');
export const INFO_CHAIN_SEND = encoder.encode('curly-spork chain send');
export const INFO_CHAIN_RECV = encoder.encode('curly-spork chain recv');
export const INFO_MESSAGE = encoder.encode('curly-spork message key');

export const DEFAULT_MAX_SKIPPED = 2000;

