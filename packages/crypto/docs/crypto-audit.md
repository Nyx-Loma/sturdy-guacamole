# Crypto Audit Package

## 1. Threat Model Snapshot

- **Assets**
  - Long-term identity key pairs (`identity/identity.ts`)
  - Session state (`sessions/state.ts`) including ratchet keys and skipped message cache
  - Encrypted payloads transiting via WebSocket transport
- **Adversaries**
  - Compromised client device attempting replay/forgery
  - Passive network observer capturing ciphertexts/metadata
  - Malicious server operator with access to encrypted envelopes and logs
  - Supply-chain attacker targeting dependency updates (`libsodium-wrappers`)
- **Entry Points & Mitigations**
  - **Resume Tokens / WebSocket Channel**: ensure resume tokens are random and hashed in logs (`packages/transport/src/logging.ts`).
  - **Double Ratchet State**: enforce skipped message bounds (`sessions/ratchet.ts`), throw on replay, and persist MAC-protected state (`sessions/state.ts`).
  - **Key Exchange**: X25519 over libsodium; HKDF derives root/chain keys with contextual info strings (`constants.ts`).
  - **Randomness**: `primitives/random.ts` wraps libsodium RNG; `packages/crypto/vitest.setup.ts` fails fast when libsodium self-test fails.

## 2. Dependency SBOM (Initial Draft)

| Package | Version | Purpose | Risk Notes |
|---------|---------|---------|------------|
| Package | Version | Purpose | Risk Notes |
|---------|---------|---------|------------|
| libsodium-wrappers | 0.7.13 | Cryptographic primitives | Pin to exact version; track upstream CVEs |
| zod | 4.1.11 | Schema validation | Ensure strict schema coverage |
| uuid | 13.0.0 | Resume token generation | Hash tokens in logs |
| rate-limiter-flexible | 7.4.0 | Transport throttling | Confirm slope limiting |
| prom-client | 15.1.3 | Metrics export | Scrub sensitive labels |
| fastify | 5.6.1 | Web transport server | Harden TLS, audit plugins |
| ws | 8.18.0 | WebSocket implementation | Apply backpressure thresholds |
| ioredis | 5.8.0 | Resume store & queue | Require TLS, rotate creds |

> TODO: export formal SPDX/JSON via `pnpm dlx cyclonedx@latest`.

## 3. Operational Runbooks (Draft)

### Key Rotation
- Rotate identity keys per device via `identity/createIdentity`; broadcast new public key to contacts.
- Re-initiate double ratchet using `sessions/handshake.performHandshake` with new key pair.
- Revoke old session state from storage and schedule message re-encryption pipeline.

### Compromised Device Procedure
- Force logout via transport service; revoke resume tokens.
- Destroy stored session state (`sessions/state.serializeState`) for affected peers.
- Re-establish sessions with `Sessions.createSessionKeyPair` + handshake.

### Backup / Restore
- Persist serialized session state with MAC (see `sessions/state.ts`) and store per peer/device in encrypted storage.
- On restore, verify MAC and counters; reject tampered or replayed blobs.
- Rotate storage keys and log access to backup buckets.

### Metadata Defense Notes
- Randomize heartbeat intervals within ±10% to reduce timing fingerprinting.
- Aggregate metrics by cohort before export; suppress per-device PII.
- For high-risk channels, consider padding message payloads to fixed buckets.

### Incident Response
- Capture audit logs with redacted tokens (transport logging module).
- Run coverage & fuzz suites to ensure no regressions introduced by hotfixes.
- Produce patched SBOM and diff vs previous deployment.
- Rotate secrets (Redis, transport tokens) and re-issue session keys.

## 4. Outstanding Tasks to Reach 90/100

1. Finalize metadata mitigation checklist (padding levels by message class).
2. Establish RNG health monitoring alerts in production.


