import { hkdfExpand } from './hkdf';
import { brandSymmetricKey, SessionSecrets, SymmetricKey, RatchetState } from './types';

const INFO_STEP = new TextEncoder().encode('curly-spork ratchet step');

export const initializeRatchet = (secrets: SessionSecrets): RatchetState => ({
  chainKey: secrets.chainKey,
  counter: 0
});

export const nextMessageKey = async (state: RatchetState): Promise<{ messageKey: SymmetricKey; state: RatchetState }> => {
  const messageKey = brandSymmetricKey(await hkdfExpand(state.chainKey, INFO_STEP, 32));
  const nextChainKey = brandSymmetricKey(await hkdfExpand(messageKey, INFO_STEP, 32));
  return {
    messageKey,
    state: {
      chainKey: nextChainKey,
      counter: state.counter + 1
    }
  };
};

