import { DEFAULT_MAX_SKIPPED, INFO_CHAIN_RECV, INFO_CHAIN_SEND, INFO_DH, INFO_MESSAGE } from '../constants';
import { hkdfExtract, hkdfExpand } from '../hkdf';
import { deriveSharedSecret, generateKeyAgreementKeyPair } from '../primitives/asymmetric';
import { brandSymmetricKey, DoubleRatchetState, PublicKey, RatchetHeader, SecretKey, SessionSecrets, SymmetricKey } from '../types';
import { seal, open, EncryptedEnvelope, EnvelopeHeader } from './envelope';
import { ReplayError, skippedMessageLimitExceeded } from '../errors';

const headerKey = (publicKey: PublicKey, counter: number) => `${Buffer.from(publicKey).toString('base64url')}:${counter}`;

const deriveChainKeys = async (rootKey: SymmetricKey, sharedSecret: Uint8Array) => {
  const prk = await hkdfExtract(rootKey, sharedSecret);
  const nextRoot = brandSymmetricKey(await hkdfExpand(prk, INFO_DH, 32));
  const sendChainKey = brandSymmetricKey(await hkdfExpand(prk, INFO_CHAIN_SEND, 32));
  const recvChainKey = brandSymmetricKey(await hkdfExpand(prk, INFO_CHAIN_RECV, 32));
  return { nextRoot, sendChainKey, recvChainKey };
};

const deriveMessageKey = async (chainKey: SymmetricKey) => {
  const messageKey = brandSymmetricKey(await hkdfExpand(chainKey, INFO_MESSAGE, 32));
  const nextChain = brandSymmetricKey(await hkdfExpand(messageKey, INFO_MESSAGE, 32));
  return { messageKey, nextChain };
};

const pruneSkipped = (state: DoubleRatchetState) => {
  const limit = state.maxSkipped ?? DEFAULT_MAX_SKIPPED;
  if (state.skipped.size <= limit) {
    return;
  }
  const [oldest] = state.skipped.keys();
  if (oldest) {
    state.skipped.delete(oldest);
  }
};

const storeSkipped = (state: DoubleRatchetState, header: RatchetHeader, messageKey: SymmetricKey) => {
  const limit = state.maxSkipped ?? DEFAULT_MAX_SKIPPED;
  if (limit <= 0) {
    throw skippedMessageLimitExceeded(limit);
  }
  if (state.skipped.size >= limit) {
    const [oldest] = state.skipped.keys();
    if (oldest) {
      state.skipped.delete(oldest);
    }
  }
  const key = headerKey(header.publicKey, header.counter);
  state.skipped.set(key, messageKey);
};

const trySkipped = (state: DoubleRatchetState, header: RatchetHeader): SymmetricKey => {
  const key = headerKey(header.publicKey, header.counter);
  const skipped = state.skipped.get(key);
  if (!skipped) {
    throw new ReplayError();
  }
  state.skipped.delete(key);
  return skipped;
};

const dhRatchet = async (state: DoubleRatchetState, remotePublicKey: PublicKey, localSecret: SecretKey) => {
  const shared = await deriveSharedSecret(localSecret, remotePublicKey);
  const { nextRoot, sendChainKey, recvChainKey } = await deriveChainKeys(state.rootKey, shared);
  return {
    rootKey: nextRoot,
    send: { chainKey: sendChainKey, counter: 0 },
    receive: { chainKey: recvChainKey, counter: 0 }
  };
};

export const initialize = async (session: SessionSecrets, localKeyPair: { publicKey: PublicKey; secretKey: SecretKey }, remotePublicKey: PublicKey, options?: { maxSkipped?: number }): Promise<DoubleRatchetState> => {
  return {
    rootKey: session.rootKey,
    send: { chainKey: session.chainKey, counter: 0 },
    receive: { chainKey: session.chainKey, counter: 0 },
    localKeyPair,
    remotePublicKey,
    skipped: new Map(),
    maxSkipped: options?.maxSkipped ?? DEFAULT_MAX_SKIPPED
  };
};

export const encrypt = async (state: DoubleRatchetState, plaintext: Uint8Array): Promise<{ envelope: EncryptedEnvelope; state: DoubleRatchetState }> => {
  const { messageKey, nextChain } = await deriveMessageKey(state.send.chainKey);
  const header: EnvelopeHeader = {
    publicKey: state.localKeyPair.publicKey,
    counter: state.send.counter + 1,
    previousCounter: state.receive.counter
  };

  const envelope = await seal(messageKey, plaintext, header);

  return {
    envelope,
    state: {
      ...state,
      send: {
        chainKey: nextChain,
        counter: header.counter
      }
    }
  };
};

export const decrypt = async (state: DoubleRatchetState, envelope: EncryptedEnvelope): Promise<{ plaintext: Uint8Array; state: DoubleRatchetState }> => {
  const header = envelope.header;

  if (header.counter <= state.receive.counter) {
    const skipped = trySkipped(state, header);
    const plaintext = await open(skipped, envelope);
    return { plaintext, state };
  }

  const nextState = { ...state };

  if (header.publicKey.toString() !== state.remotePublicKey.toString()) {
    const newKeys = await generateKeyAgreementKeyPair();
    nextState.localKeyPair = newKeys;
    const ratchetKeys = await dhRatchet(state, header.publicKey as PublicKey, newKeys.secretKey);
    nextState.rootKey = ratchetKeys.rootKey;
    nextState.send = ratchetKeys.send;
    nextState.receive = ratchetKeys.receive;
    nextState.remotePublicKey = header.publicKey as PublicKey;
    nextState.skipped.clear();
  }

  while (nextState.receive.counter < header.counter - 1) {
    const { messageKey, nextChain } = await deriveMessageKey(nextState.receive.chainKey);
    nextState.receive.chainKey = nextChain;
    nextState.receive.counter += 1;
    storeSkipped(nextState, {
      publicKey: nextState.remotePublicKey,
      counter: nextState.receive.counter,
      previousCounter: nextState.receive.counter - 1
    }, messageKey);
  }

  const { messageKey, nextChain } = await deriveMessageKey(nextState.receive.chainKey);
  nextState.receive.chainKey = nextChain;
  nextState.receive.counter = header.counter;

  const plaintext = await open(messageKey, envelope);

  return {
    plaintext,
    state: nextState
  };
};

export const __testables = {
  pruneSkipped,
  storeSkipped,
  trySkipped
};

