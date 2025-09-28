import { RatchetState, SymmetricKey, brandSymmetricKey } from '../types';
import { compareUint8 } from '../utils/compare';
import { zeroize } from '../utils/memory';
import { createHmac } from 'node:crypto';

export type SerializedSessionState = {
  v: 1;
  rootKey: string;
  sendCounter: number;
  receiveCounter: number;
  skipped: Array<{ header: string; key: string }>;
  mac: string;
};

const toBase64 = (value: Uint8Array) => Buffer.from(value).toString('base64url');
const fromBase64 = (value: string) => new Uint8Array(Buffer.from(value, 'base64url'));

const computeMac = (payload: Uint8Array, macKey: Uint8Array) => {
  const hmac = createHmac('sha256', macKey);
  hmac.update(payload);
  const digest = new Uint8Array(hmac.digest());
  const encoded = toBase64(digest);
  zeroize(digest);
  return encoded;
};

export const serializeState = (rootKey: SymmetricKey, send: RatchetState, receive: RatchetState, skipped: Map<string, SymmetricKey>): SerializedSessionState => {
  const payload: Omit<SerializedSessionState, 'mac'> = {
    v: 1,
    rootKey: toBase64(rootKey),
    sendCounter: send.counter,
    receiveCounter: receive.counter,
    skipped: [...skipped].map(([header, key]) => ({ header, key: toBase64(key) }))
  };
  const json = Buffer.from(JSON.stringify(payload));
  const macKey = rootKey.slice(0, 32);
  const mac = computeMac(json, macKey);
  zeroize(macKey);
  return { ...payload, mac };
};

export const deserializeState = (input: SerializedSessionState) => {
  if (input.v !== 1) {
    throw new Error('unsupported session state version');
  }
  const { mac, ...rest } = input;
  const json = Buffer.from(JSON.stringify(rest));
  const macKey = fromBase64(rest.rootKey).slice(0, 32);
  const expectedMac = computeMac(json, macKey);
  const valid = compareUint8(Buffer.from(mac), Buffer.from(expectedMac));
  zeroize(macKey);
  zeroize(json);
  zeroize(Buffer.from(expectedMac));
  if (!valid) {
    throw new Error('session state integrity check failed');
  }
  const skipped = new Map<string, SymmetricKey>();
  for (const entry of input.skipped) {
    skipped.set(entry.header, brandSymmetricKey(fromBase64(entry.key)));
  }
  return {
    rootKey: brandSymmetricKey(fromBase64(input.rootKey)),
    send: { chainKey: brandSymmetricKey(new Uint8Array()), counter: input.sendCounter },
    receive: { chainKey: brandSymmetricKey(new Uint8Array()), counter: input.receiveCounter },
    skipped
  };
};

