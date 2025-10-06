/* global __ENV, __VU, __ITER */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  vus: 5,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500'],
  },
};

const BASE = __ENV.BASE_URL; // e.g. https://api.sanctum.local
const TOKEN = __ENV.BEARER;  // JWT for test user
const CONV = __ENV.CONV_ID;  // seeded conversation id (UUID)
const SENDER = __ENV.SENDER_ID || '00000000-0000-0000-0000-000000000001';

export default function () {
  const idk = uuidv4();
  const payload = {
    conversationId: CONV,
    senderId: SENDER,
    type: 'text',
    encryptedContent: 'SGVsbG8=', // "Hello" base64
    payloadSizeBytes: 5,
  };

  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': idk,
    // Spread per-route rate limits across device/session and keep <=30 req/min per device
    'x-device-id': `${SENDER}-${__VU}`,
    'x-session-id': `${SENDER}-${__VU}-${__ITER}`,
  };

  const res = http.post(`${BASE}/v1/messages`, JSON.stringify(payload), { headers });
  check(res, { '201 or 200 on send': (r) => r.status === 201 || r.status === 200 });

  // Catch-up read for the same conversation
  const r2 = http.get(`${BASE}/v1/messages/conversation/${CONV}?limit=50`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(r2, { '200 list': (r) => r.status === 200 });

  // Keep per-device at ~30/min to respect default rate limits
  sleep(2);
}


