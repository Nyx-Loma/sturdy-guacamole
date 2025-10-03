#!/usr/bin/env node

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8083/ws';
const DEVICE_ID = 'test-device-001';
const SESSION_ID = 'test-session-001';

console.log('📡 WebSocket Test Client');
console.log('========================');
console.log(`Connecting to: ${WS_URL}`);
console.log(`Device ID: ${DEVICE_ID}`);
console.log(`Session ID: ${SESSION_ID}`);
console.log('');

const ws = new WebSocket(WS_URL, {
  headers: {
    'x-device-id': DEVICE_ID,
    'x-session-id': SESSION_ID
  }
});

ws.on('open', () => {
  console.log('✅ Connected to WebSocket server');
  console.log('⏳ Waiting for messages...');
  console.log('');
});

ws.on('message', (data) => {
  const timestamp = new Date().toISOString();
  console.log(`📨 [${timestamp}] Message received:`);
  try {
    const parsed = JSON.parse(data.toString());
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.log(data.toString());
  }
  console.log('');
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`🛑 Connection closed. Code: ${code}, Reason: ${reason || 'N/A'}`);
  process.exit(0);
});

// Keep alive
process.on('SIGINT', () => {
  console.log('\n👋 Closing connection...');
  ws.close();
});

console.log('Press Ctrl+C to disconnect\n');

