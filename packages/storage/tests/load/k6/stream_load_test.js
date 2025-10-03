/* eslint-disable no-undef */
import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { randomItem } from "./utils.js";

const RPS = Number(__ENV.RPS ?? 250);
const DURATION = __ENV.DURATION ?? "5m";
const PAYLOAD_BYTES = Number(__ENV.PAYLOAD_BYTES ?? 1024); // 1 KiB default

export const options = {
  scenarios: {
    pub_rate: {
      executor: "constant-arrival-rate",
      rate: RPS,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.min(RPS * 2, 1000),
      maxVUs: Math.min(RPS * 4, 2000),
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<200"],
    http_req_failed: ["rate<0.005"],
  },
};

const config = new SharedArray("config", () => [
  {
    streamUrl: __ENV.STREAM_URL,
    token: __ENV.STREAM_TOKEN,
  },
]);

export default function streamLoad() {
  const env = randomItem(config);
  const value = String(exec.vu.iterationInScenario);
  const pad = PAYLOAD_BYTES > value.length ? "x".repeat(PAYLOAD_BYTES - value.length) : "";
  const payload = JSON.stringify({ value: value + pad, sentAt: Date.now() });

  const res = streamPublish(env.streamUrl, env.token, payload);
  check(res, {
    "status is 200": (r) => r.status === 200,
  });

}

function streamPublish(url, token, payload) {
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  return http.post(`${url}/streams/events`, payload, params);
}

