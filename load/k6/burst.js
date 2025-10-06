/* global __ENV */
import http from 'k6/http';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  scenarios: {
    bursts: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { target: 300, duration: '2m' },
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500'],
  },
};

const BASE = __ENV.BASE_URL;
const TOKEN = __ENV.BEARER;
const CONV = __ENV.CONV_ID;
const SENDER = __ENV.SENDER_ID || '00000000-0000-0000-0000-000000000001';
const DEVICE_ID = __ENV.DEVICE_ID || '1f288688-d630-4631-ab47-ebf203afd834';
const SESSION_ID = __ENV.SESSION_ID || '1b796eb0-65c8-4b88-a3d0-dcbb8399961a';

export default function () {
  const idk = uuidv4();
  const payload = {
    conversationId: CONV,
    senderId: SENDER,
    type: 'text',
    encryptedContent: 'SGVsbG8=',
    payloadSizeBytes: 5,
  };
  const res = http.post(`${BASE}/v1/messages`, JSON.stringify(payload), {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idk,
      'x-device-id': DEVICE_ID,
      'x-session-id': SESSION_ID,
    },
  });
  check(res, { ok: (r) => r.status === 201 || r.status === 200 });
}


