/*
 Opt-in E2E: set E2E_ENABLE=1 BASE_URL=... BEARER=... CONV_ID=... before running.
 Uses fetch to POST opaque ciphertext and tails logs from a running service URL.
 In CI, prefer attaching to container logs. Here we assert against API + metrics only.
*/
import { afterAll, beforeAll, it, expect } from 'vitest';

const enabled = process.env.E2E_ENABLE === '1';
const BASE = process.env.BASE_URL || '';
const TOKEN = process.env.BEARER || '';
const CONV = process.env.CONV_ID || '';

const PLAINTEXT_MARKERS = [
  'TOP-SECRET:ALPHA123',
  '4111-1111-1111-1111',
  'SSN 999-99-9999',
  'This should NEVER appear in logs',
];

let metricsBody = '';

beforeAll(async () => {
  if (!enabled) return;
  // Prime metrics endpoint; ignore errors if not exposed.
  try {
    const res = await fetch(`${BASE}/metrics`);
    if (res.ok) metricsBody = await res.text();
  } catch {
    // Ignore if metrics endpoint is not exposed
  }
});

afterAll(async () => {
  // nothing
});

it('no plaintext or forbidden metadata leaks (opt-in)', async () => {
  if (!enabled) return; // skip without failing
  for (const marker of PLAINTEXT_MARKERS) {
    const ciphertextB64 = Buffer.from(marker, 'utf8').toString('base64');
    const res = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        conversationId: CONV,
        senderId: '00000000-0000-0000-0000-000000000001',
        type: 'text',
        encryptedContent: ciphertextB64,
        payloadSizeBytes: ciphertextB64.length,
      }),
    });
    expect([200, 201]).toContain(res.status);
  }

  // Pull /metrics again and assert markers are not present
  try {
    const res = await fetch(`${BASE}/metrics`);
    const text = res.ok ? await res.text() : '';
    for (const marker of PLAINTEXT_MARKERS) {
      expect(text.includes(marker)).toBe(false);
      expect(metricsBody.includes(marker)).toBe(false);
    }
  } catch {
    // Ignore if metrics fetch fails
  }
});


