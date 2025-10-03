#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8083/ws';
const NUM_CLIENTS = 3;

console.log('📡 Multi-Client WebSocket Test');
console.log('==============================');
console.log(`Connecting ${NUM_CLIENTS} clients to: ${WS_URL}`);
console.log('');

const clients = [];
let messagesReceived = 0;

for (let i = 1; i <= NUM_CLIENTS; i++) {
  const deviceId = `test-device-00${i}`;
  const sessionId = `test-session-00${i}`;
  
  const ws = new WebSocket(WS_URL, {
    headers: {
      'x-device-id': deviceId,
      'x-session-id': sessionId
    }
  });

  ws.on('open', () => {
    console.log(`✅ Client ${i} (${deviceId}) connected`);
  });

  ws.on('message', (data) => {
    messagesReceived++;
    const timestamp = new Date().toISOString();
    console.log(`\n📨 Client ${i} [${timestamp}] received message:`);
    try {
      const parsed = JSON.parse(data.toString());
      console.log(`   Message ID: ${parsed.payload?.data?.messageId || 'N/A'}`);
      console.log(`   Conversation: ${parsed.payload?.data?.conversationId || 'N/A'}`);
      console.log(`   Seq: ${parsed.payload?.seq || 'N/A'}`);
    } catch (e) {
      console.log(`   Raw: ${data.toString().substring(0, 100)}...`);
    }
  });

  ws.on('error', (error) => {
    console.error(`❌ Client ${i} error:`, error.message);
  });

  ws.on('close', (code, reason) => {
    console.log(`🛑 Client ${i} closed. Code: ${code}`);
  });

  clients.push({ id: i, deviceId, ws });
}

// Keep alive
process.on('SIGINT', () => {
  console.log('\n\n📊 SUMMARY:');
  console.log(`   Total clients: ${NUM_CLIENTS}`);
  console.log(`   Messages received: ${messagesReceived}`);
  console.log(`   Expected: ${NUM_CLIENTS} (one per client)`);
  console.log('\n👋 Closing all connections...');
  clients.forEach(c => c.ws.close());
  setTimeout(() => process.exit(0), 500);
});

console.log('\nAll clients started. Press Ctrl+C to disconnect\n');

