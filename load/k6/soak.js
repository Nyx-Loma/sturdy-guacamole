/* global __ENV */
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '30m',
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500'],
  },
};

const BASE = __ENV.BASE_URL;
const TOKEN = __ENV.BEARER;
const CONV = __ENV.CONV_ID;

export default function () {
  http.get(`${BASE}/v1/messages/conversation/${CONV}?limit=10`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  sleep(0.5);
}


