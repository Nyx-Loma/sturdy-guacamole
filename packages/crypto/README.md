# Crypto Package

Wraps libsignal-client primitives, key serialization, and protocol helpers for X3DH and Double Ratchet flows.

> Status: placeholder pending implementation.

## Scope

- Provide audited primitives for:
  - Symmetric encryption (AEAD) for envelope/message protection
  - Asymmetric key agreement + signatures (X25519/Ed25519)
  - HKDF-based key derivation for session and message keys
  - Secure random number generation and nonce strategy helpers
- Offer a small, typed API consumed by transport, auth, and storage services.
- Prohibit ad-hoc crypto usage outside this package; all consumers go through these helpers.

## Threat Model Overview

- **Confidentiality**: Messages and stored blobs must stay private even if transport logs leak.
- **Integrity**: Detect tampering on ciphertexts, headers, and resume tokens.
- **Replay resistance**: Ensure nonce/key reuse protections; consumers must track sequence numbers.
- **Key compromise**: Document blast radius and provide rotation utilities.
- **Side-channel/TIMING**: Favor constant-time libsodium primitives; avoid branching on secrets.

Detailed threat modeling and API docs will follow as the implementation matures.

## Usage Examples

### Generating a Session
```ts
import { Session } from '@sanctum/crypto';

const alice = await Session.createSessionKeyPair();
const bob = await Session.createSessionKeyPair();

const aliceSecrets = await Session.performHandshake(alice.secretKey, bob.publicKey);
const bobSecrets = await Session.performHandshake(bob.secretKey, alice.publicKey);
```

### Encrypting a Message Envelope
```ts
import { Envelope } from '@sanctum/crypto';

const message = new TextEncoder().encode('hello');
const envelope = await Envelope.seal(aliceSecrets.chainKey, message);
const decrypted = await Envelope.open(bobSecrets.chainKey, envelope);
```

### Signing and Verifying
```ts
import { Asymmetric } from '@sanctum/crypto';

const { publicKey, secretKey } = await Asymmetric.generateSigningKeyPair();
const message = new TextEncoder().encode('sign me');
const signature = await Asymmetric.sign(message, secretKey);
const valid = await Asymmetric.verify(message, signature, publicKey);
```

