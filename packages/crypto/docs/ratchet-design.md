# Double Ratchet Design Notes

Status: draft

## Goals

- Support asynchronous messaging with forward secrecy and break-in recovery.
- Play nicely with existing `Session` (handshake) and `Envelope` helpers.
- Provide a modular API so higher layers can plug in persistence/queueing.

## State Shape

```ts
interface RatchetState {
  rootKey: SymmetricKey;
  send: ChainState;
  receive: ChainState;
  skipped: Map<string, MessageKey>; // keyed by (senderPublicKey, counter)
  remotePublicKey: PublicKey;
  localKeyPair: KeyPair;
  lastRemoteCounter: number;
}

interface ChainState {
  chainKey: SymmetricKey;
  counter: number;
}
```

## Operations

1. `initialize( sessionSecrets, localKeyPair, remotePublicKey )`
   - Seed `rootKey`, `send`, and `receive` chains using `Session.performHandshake` output.
2. `encrypt(message: Uint8Array, state: RatchetState)`
   - Derive next message key from `send.chainKey`.
   - Encrypt with `Envelope.seal` using message key.
   - Emit header containing local public key + counter.
3. `decrypt(packet, state)`
   - If header public key == current remote key: use receive chain.
   - Else perform DH ratchet: derive new root/send/receive from DH(localSecret, new remote public).
   - Check skipped map before deriving new keys.
4. Housekeeping helpers: `storeSkippedKey`, `purgeSkipped(uint32 limit)`, `rotateRoot` etc.

## Persistence Hooks

- `onStateChange(RatchetState)` for callers to store updated state.
- `loadSkippedKey(header)` and `storeSkippedKey(header, messageKey)` for multi-device support.

## Testing Strategy

- Use libsodium reference implementations for cross-check.
- Property tests: encrypt/decrypt roundtrip, DH ratchet after remote key change.
- Negative: replay old header, corrupted header, exhausted skipped queue.

Next steps: implement `ratchet.ts` with the state and APIs above, then layer tests before integrating into higher-level flows.

