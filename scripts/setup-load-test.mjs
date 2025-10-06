/* global process, console */
import { SignJWT, importPKCS8 } from 'jose';
import { createRequire } from 'module';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

// RSA private key for signing test JWTs
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC949AxPtxWw0/4
GiqGci/apRQO0RazsAeyhHIdtyFnny1Z17Rat51rwdBU4pmxktOLq9ReOpYGRhV+
0/QyFjzXTO94jqngF8zEomRuLkvUJHI9rXXQ71wyFzlmew8WrBgr2FM4VjAAN0e3
Co/JfcCrpukaYdldstZqgWxHUz7r1+0XSyUatKm64gS0BIYAmGS/VpLQhx9URDOz
MAi7qKzjKm8ltR7BvCpiFG55AJLhBiGdOggAICZ+CtAsJtLmiXFfM61PN+ECstRL
x2W5Eyt5h25MCzQLWgkcVQweGTg5d4W85P2E7H2prW6/ZSFYWpK+LJI4Ldo+kK2P
cWcQ6cNNAgMBAAECggEALkfpBSeiAk+GHR0bgjswaKTVV6skUlUz+xGG0rFApgXI
wt3s6jNYXdwWD6pO9VWo06DkmLbEu/C26nt0SATdfUgWEZcL1j9WvBIsUiJcfu8H
HPs6/Npp6Rd5+P1DNy5okb8ewVtYRaUziGw9kUlh/TQoGjMBDHI7CihTIKssacSB
nSJux739e5+XFCVUPUYU3GYqi8Eo39MIVN473zjI7OxSRalTSeD379Sh7LrILFle
HIZPdINB34mRbi7gJGxh4hp/dyAIVNIRYiXRWvk77SUYgpZ0rQp+QF5iXwBea7OP
xlKB3miVvvlt5NUnEpQtRZSsCURzHdwDCBw3dtN+IQKBgQD4LwY+QKMq2PtNs6AD
mB6H3DmGI7D0lpSV/9iLrE8DhiqdJJMej4WeJSmpUCFDeYmcMci4+8CoIjPq+/J0
AhHoamhodGhEDVYyar3abUCUbSkRvSV1ji+alfgT5QzDdxsmPwy+GSiF8vl9aZv6
Klf6xiDNOJPc4nTgae5TWP8nRQKBgQDD3sviBl7rLvErVH7625O+jmj8jZ7hLVT2
7Lm9DHRwvpFoKX7Qbqm4mqJU8tFaKAK5acTfvn/tF8gSHbhxwGGzhCp14zOAm+R5
bF+JhUEMzxjLLpNQEhYa0VwLUiaznb1D0JJh/h4BTg88IQ5X4+Wms6CebBzkdv/6
6vYT8S6IaQKBgB7D1YZKBO/+zcgoCCHp7X7x8b+LFRh8whaGDJXj2jeZnha0vff/
2pRsDuoKINV4b3KJSVSFALDW7JCogrmWuBmTdzXbmEE3VgQR707wVB0SGxEz3Tzh
T01eYc41iouAbEEld7Lo83kHUZ4WRVuRfC59+Pr3lHzBJbPb7csvMRHxAoGBAIwl
YeQ7grbsQ4spTiHX8oKqCtyJyGB9uwlioBNwUfBJqmjJJ/+i7rUzj2sQwlKrxic8
Uq109LuEBJdRxKM/b6iurGLlSfh/kp5+uG0Bd2Xe2HKoxKbKCh7uJdnD0gU6nC1l
kxeiZ32viJ8RV93zJmJ8rDQuTw35R3cVnzTtoMnhAoGAb0mUSF3I4XwPmnjCvIN8
3mjL3Qr4SYZNZBnRKU/A3FgLt1Eps+0JusgdsEJokXzgjOu9k5txvVA/C6AvUe70
n/PZdxPyFBzKDd6zPESX8dILgU9TiCKF8FY3WIqiAKOURtyXBynUtQtGaI4RlU2w
JMd+fUcgN9JRBBJz1OwF/j0=
-----END PRIVATE KEY-----`;

// Matching public key (use this for messaging service JWT_PUBLIC_KEY)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvePQMT7cVsNP+BoqhnIv
2qUUDtEWs7AHsoRyHbchZ58tWde0Wreda8HQVOKZsZLTi6vUXjqWBkYVftP0MhY8
10zveI6p4BfMxKJkbi5L1CRyPa110O9cMhc5ZnsPFqwYK9hTOFYwADdHtwqPyX3A
q6bpGmHZXbLWaoFsR1M+69ftF0slGrSpuuIEtASGAJhkv1aS0IcfVEQzszAIu6is
4ypvJbUewbwqYhRueQCS4QYhnToIACAmfgrQLCbS5olxXzOtTzfhArLUS8dluRMr
eYduTAs0C1oJHFUMHhk4OXeFvOT9hOx9qa1uv2UhWFqSviySOC3aPpCtj3FnEOnD
TQIDAQAB
-----END PUBLIC KEY-----`;

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/messaging_test';

// Fixed test IDs for consistency
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEST_CONV_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const generateJWT = async () => {
  const deviceId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  
  const privateKey = await importPKCS8(PRIVATE_KEY, 'RS256');

  const token = await new SignJWT({ 
    sub: TEST_USER_ID, 
    deviceId: deviceId,
    sessionId: sessionId,
    scope: [],
    ver: 1, 
    jti: crypto.randomUUID() 
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuedAt()
    .setIssuer('sanctum-auth')
    .setAudience('sanctum-clients')
    .setExpirationTime('2h')
    .sign(privateKey);

  return { token, userId: TEST_USER_ID, deviceId };
};

const seedConversation = async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const participantId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const now = new Date().toISOString();

    // Clean up existing test data
    await client.query(`DELETE FROM messaging.conversation_audit WHERE conversation_id = $1`, [TEST_CONV_ID]);
    await client.query(`DELETE FROM messaging.conversation_participants WHERE conversation_id = $1`, [TEST_CONV_ID]);
    await client.query(`DELETE FROM messaging.messages WHERE conversation_id = $1`, [TEST_CONV_ID]);
    await client.query(`DELETE FROM messaging.conversations WHERE id = $1`, [TEST_CONV_ID]);

    // Create conversation
    await client.query(
      `INSERT INTO messaging.conversations (id, type, name, settings, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [TEST_CONV_ID, 'group', 'Load Test Conversation', JSON.stringify({}), now, now]
    );

    // Add participants (creator + one other)
    await client.query(
      `INSERT INTO messaging.conversation_participants (conversation_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, $4), ($1, $5, $6, $4)`,
      [TEST_CONV_ID, TEST_USER_ID, 'admin', now, participantId, 'member']
    );

    // Add audit record
    await client.query(
      `INSERT INTO messaging.conversation_audit (conversation_id, actor_id, action, occurred_at, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [TEST_CONV_ID, TEST_USER_ID, 'created', now, JSON.stringify({ type: 'group' })]
    );

    console.log(`✅ Seeded conversation: ${TEST_CONV_ID}`);
    console.log(`   Participants: ${TEST_USER_ID} (admin), ${participantId} (member)`);
    
    return { conversationId: TEST_CONV_ID, senderId: TEST_USER_ID };
  } finally {
    await client.end();
  }
};

const main = async () => {
  console.log('🚀 Setting up messaging service load test...\n');

  // Seed conversation first
  console.log('1️⃣ Seeding conversation in database...');
  const { conversationId, senderId } = await seedConversation();

  // Generate JWT
  console.log('\n2️⃣ Generating JWT token...');
  const { token } = await generateJWT();
  console.log(`   User ID: ${senderId}`);
  console.log(`   Conv ID: ${conversationId}`);
  console.log(`   Token: ${token.substring(0, 60)}...\n`);

  // Output commands
  console.log('\n✅ Setup complete! Run these commands:\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📝 SMOKE TEST (5 VUs, 1 min)');
  console.log('─'.repeat(70));
  console.log(`cd /Users/isakparild/Desktop/a-messages && BASE_URL=http://localhost:8083 BEARER="${token}" CONV_ID="${conversationId}" SENDER_ID="${senderId}" k6 run load/k6/smoke.js`);
  
  console.log('\n\n💥 BURST TEST (50→300 RPS, 2.5 min)');
  console.log('─'.repeat(70));
  console.log(`cd /Users/isakparild/Desktop/a-messages && BASE_URL=http://localhost:8083 BEARER="${token}" CONV_ID="${conversationId}" SENDER_ID="${senderId}" k6 run load/k6/burst.js`);
  
  console.log('\n\n⏱️  SOAK TEST (50 VUs, 30 min)');
  console.log('─'.repeat(70));
  console.log(`cd /Users/isakparild/Desktop/a-messages && BASE_URL=http://localhost:8083 BEARER="${token}" CONV_ID="${conversationId}" SENDER_ID="${senderId}" k6 run load/k6/soak.js`);
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
};

main().catch(console.error);
