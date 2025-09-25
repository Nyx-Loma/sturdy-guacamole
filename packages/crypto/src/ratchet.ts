import { brandSymmetricKey, PublicKey, RatchetHeader, RatchetState, SecretKey, SessionSecrets, SymmetricKey } from './types';
import { hkdfExtract, hkdfExpand } from './hkdf';
import { brandPublicKey } from './types';
import { createSessionKeyPair, performHandshake } from './session';
import { Envelope, Asymmetric, Random } from './index';

const INFO_DH = new TextEncoder().encode('curly-spork dh');
const INFO_CHAIN_SEND = new TextEncoder().encode('curly-spork chain send');
const INFO_CHAIN_RECV = new TextEncoder().encode('curly-spork chain recv');
const INFO_MESSAGE = new TextEncoder().encode('curly-spork message key');

export interface DoubleRatchetState {
  rootKey: SymmetricKey;
  send: RatchetState;
  receive: RatchetState;
  localKeyPair: { publicKey: PublicKey; secretKey: SecretKey };
  remotePublicKey: PublicKey;
  skipped: Map<string, SymmetricKey>;
}

export interface RatchetEncryptResult {
  envelope: Envelope.EncryptedEnvelope;
  state: DoubleRatchetState;
}

export interface RatchetDecryptResult {
  plaintext: Uint8Array;
  state: DoubleRatchetState;
}

const headerKey = (publicKey: PublicKey, counter: number) => `${Buffer.from(publicKey).toString('base64url')}:${counter}`;

export const initialize = async (session: SessionSecrets, localKeyPair: { publicKey: PublicKey; secretKey: SecretKey }, remotePublicKey: PublicKey): Promise<DoubleRatchetState> => {
  return {
    rootKey: session.rootKey,
    send: { chainKey: session.chainKey, counter: 0 },
    receive: { chainKey: session.chainKey, counter: 0 },
    localKeyPair,
    remotePublicKey,
    skipped: new Map()
  };
};

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

const dhRatchet = async (state: DoubleRatchetState, remotePublicKey: PublicKey, localSecret: SecretKey) => {
  const shared = await Asymmetric.deriveSharedSecret(localSecret, remotePublicKey);
  const { nextRoot, sendChainKey, recvChainKey } = await deriveChainKeys(state.rootKey, shared);
  return {
    rootKey: nextRoot,
    send: { chainKey: sendChainKey, counter: 0 },
    receive: { chainKey: recvChainKey, counter: 0 }
  };
};

export const encrypt = async (state: DoubleRatchetState, plaintext: Uint8Array): Promise<RatchetEncryptResult> => {
  const { messageKey, nextChain } = await deriveMessageKey(state.send.chainKey);
  const header: RatchetHeader = {
    publicKey: state.localKeyPair.publicKey,
    counter: state.send.counter + 1,
    previousCounter: state.receive.counter
  };

  const envelope = await Envelope.seal(messageKey, plaintext, header);

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

const trySkipped = (state: DoubleRatchetState, header: RatchetHeader): SymmetricKey | undefined => {
  const key = headerKey(header.publicKey, header.counter);
  const skipped = state.skipped.get(key);
  if (skipped) {
    state.skipped.delete(key);
  }
  return skipped;
};

const storeSkipped = (state: DoubleRatchetState, header: RatchetHeader, messageKey: SymmetricKey) => {
  const key = headerKey(header.publicKey, header.counter);
  state.skipped.set(key, messageKey);
};

export const decrypt = async (state: DoubleRatchetState, envelope: Envelope.EncryptedEnvelope): Promise<RatchetDecryptResult> => {
  const header = envelope.header;

  if (header.counter <= state.receive.counter) {
    const skipped = trySkipped(state, header);
    if (!skipped) {
      throw new Error('header counter already processed');
    }
    const plaintext = await Envelope.open(skipped, envelope);
    return { plaintext, state };
  }

  let nextState = { ...state };

  if (header.publicKey.toString() !== state.remotePublicKey.toString()) {
    const newKeys = await createSessionKeyPair();
    nextState.localKeyPair = newKeys;
    const ratchetKeys = await dhRatchet(state, header.publicKey as PublicKey, newKeys.secretKey);
    nextState.rootKey = ratchetKeys.rootKey;
    nextState.send = ratchetKeys.send;
    nextState.receive = ratchetKeys.receive;
    nextState.remotePublicKey = header.publicKey as PublicKey;
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

  const plaintext = await Envelope.open(messageKey, envelope);

  return {
    plaintext,
    state: nextState
  };
};

