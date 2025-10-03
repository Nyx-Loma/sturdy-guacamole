# Messaging Service: Stage 3 Implementation Plan

**Goal:** Production-grade messaging service ready for GA  
**Current Score:** 7.5/10  
**Target Score:** 9.0/10  
**Timeline:** 3 days  
**Last Updated:** 2025-10-03

---

## Overview

This document outlines the hardened roadmap to take messaging from "works in beta" to "ship to GA." It incorporates production-grade practices: RLS, idempotency, versioned caching, feature flags, and SLO-based auto-rollback.

---

## Stage 3A: Conversation CRUD (1 day) → 8.0/10

**Impact:** +0.5 points | **Effort:** 1 day

### Context
Currently conversations are manually inserted via SQL. Need full REST API with proper guarantees for GA.

### API Contracts

#### 1. POST /v1/conversations

**Headers:**
- `Idempotency-Key` (optional, 24h deduplication)
- `X-Device-Id` (temporary, until Stage 4 auth)
- `X-Session-Id`

**Request:**
```json
{
  "type": "direct" | "group" | "channel",
  "metadata": {
    "name": "Team Discussion",
    "avatar": "https://...",
    "custom": {}
  },
  "participants": ["user-id-1", "user-id-2"]
}
```

**Rules:**
- `type=direct` → exactly 2 unique participants
- Enforce unique direct conversation by `(min(userA, userB), max(userA, userB))`
- Creator becomes admin automatically
- Idempotent create scoped by `(creatorId, participantsHash, type, idempotencyKey)` for 24h
- On replay: return `200` + `Idempotent-Replay: true` header

**Response:**
```json
{
  "id": "uuid",
  "type": "direct",
  "createdAt": "2025-10-03T...",
  "updatedAt": "2025-10-03T...",
  "deletedAt": null,
  "metadata": {...},
  "version": 1,
  "participants": [...]
}
```

#### 2. GET /v1/conversations/:id

**Response:** Full conversation entity + participants (role, joinedAt)  
**Auth:** Must be participant (via RLS + middleware)

#### 3. PATCH /v1/conversations/:id

**Request:**
```json
{
  "metadata": { "name": "Updated Name" }
}
```

**Headers:**
- `If-Match: <version>` (optimistic concurrency)

**Behavior:**
- Update metadata only (type is immutable)
- Increment version on success
- Return `409 Conflict` if version mismatch

**Auth:** Must be participant

#### 4. DELETE /v1/conversations/:id

**Behavior:**
- Soft delete: set `deleted_at = NOW()`
- Only admin or creator may delete

**Auth:** Must be admin/creator

#### 5. GET /v1/conversations

**Query params:**
- `?limit=50` (default: 50, max: 100)
- `?cursor=base64url(updatedAt|id)`

**Behavior:**
- Order by `(updated_at ASC, id ASC)`
- Filter: only conversations user participates in (via RLS)

**Response:**
```json
{
  "conversations": [...],
  "nextCursor": "base64url(...)"
}
```

### Database Schema

#### messaging.conversations
```sql
CREATE TABLE messaging.conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN ('direct', 'group', 'channel')),
  creator_id    UUID NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  version       INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- Indexes
CREATE INDEX conversations_type_idx ON messaging.conversations (type);
CREATE INDEX conversations_updated_pagination ON messaging.conversations (updated_at, id);

-- Direct conversation de-duplication
CREATE UNIQUE INDEX conversations_direct_unique 
  ON messaging.conversations (LEAST(creator_id, (participants->>0)::uuid), GREATEST(creator_id, (participants->>0)::uuid))
  WHERE type = 'direct' AND deleted_at IS NULL;

-- Version bump trigger
CREATE OR REPLACE FUNCTION bump_conversation_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversations_version_trigger
  BEFORE UPDATE ON messaging.conversations
  FOR EACH ROW
  WHEN (OLD.metadata IS DISTINCT FROM NEW.metadata)
  EXECUTE FUNCTION bump_conversation_version();
```

#### messaging.participants (updated)
```sql
-- Add left_at for soft participant removal
ALTER TABLE messaging.participants ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- Unique constraint: one active membership per user per conversation
CREATE UNIQUE INDEX participants_unique_active 
  ON messaging.participants (conversation_id, user_id) 
  WHERE left_at IS NULL;

-- Partial index for active participants (performance)
CREATE INDEX participants_active_conv 
  ON messaging.participants (conversation_id) 
  WHERE left_at IS NULL;
```

### Row-Level Security (RLS)

```sql
-- Enable RLS on conversations
ALTER TABLE messaging.conversations ENABLE ROW LEVEL SECURITY;

-- Read policy: can see if you're a participant
CREATE POLICY conversations_read_policy ON messaging.conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM messaging.participants p 
      WHERE p.conversation_id = conversations.id 
        AND p.user_id = current_setting('app.current_user_id')::uuid
        AND p.left_at IS NULL
    )
  );

-- Write policy: only admin or creator can modify
CREATE POLICY conversations_write_policy ON messaging.conversations
  FOR UPDATE
  USING (
    creator_id = current_setting('app.current_user_id')::uuid
    OR EXISTS (
      SELECT 1 
      FROM messaging.participants p 
      WHERE p.conversation_id = conversations.id 
        AND p.user_id = current_setting('app.current_user_id')::uuid
        AND p.role = 'admin'
        AND p.left_at IS NULL
    )
  );

-- Delete policy: only admin or creator
CREATE POLICY conversations_delete_policy ON messaging.conversations
  FOR DELETE
  USING (
    creator_id = current_setting('app.current_user_id')::uuid
    OR EXISTS (
      SELECT 1 
      FROM messaging.participants p 
      WHERE p.conversation_id = conversations.id 
        AND p.user_id = current_setting('app.current_user_id')::uuid
        AND p.role = 'admin'
        AND p.left_at IS NULL
    )
  );
```

### Files to Create/Modify
- `src/app/routes/conversations.ts` (~220 lines)
- `src/app/routes/schemas/conversations.ts` (~160 lines)
- `src/tests/unit/routes/conversationsRoutes.test.ts` (~320 lines)
- `src/tests/integration/rls_policies.int.test.ts` (~200 lines)
- `src/tests/integration/idempotency.int.test.ts` (~180 lines)

### Tests (Acceptance Criteria)
- ✅ Idempotent create: first=201, replay=200 with `Idempotent-Replay: true`
- ✅ Direct de-duplication enforced
- ✅ RLS denies non-participants
- ✅ Versioned PATCH with `If-Match` returns 409 on conflict
- ✅ Soft delete sets `deleted_at`, doesn't remove row
- ✅ List endpoint respects RLS and pagination

---

## Stage 3B: Participant Management (1 day) → 8.3/10

**Impact:** +0.3 points | **Effort:** 1 day

### Context
Need secure participant add/remove with correct cache invalidation to prevent unauthorized access.

### API Contracts

#### 1. POST /v1/conversations/:id/participants

**Request:**
```json
{
  "userId": "uuid",
  "role": "member" | "admin"
}
```

**Auth:** Caller must be admin of conversation

**Behavior:**
- Insert participant row (no-op if already active)
- Increment participant version: `INCR conv:{id}:part:ver`
- Publish invalidation: `PUBLISH conv.participants.inval {"id": "...", "ver": 123}`
- Emit `participant_added` event
- Return updated participant list

#### 2. DELETE /v1/conversations/:id/participants/:userId

**Auth:** Caller must be admin OR removing self

**Behavior:**
- Set `left_at = NOW()` (soft delete)
- If last participant: soft-delete conversation (atomic transaction)
- Increment participant version
- Publish invalidation
- Emit `participant_removed` event

#### 3. GET /v1/conversations/:id/participants

**Query params:**
- `?limit=50`
- `?cursor=base64url(joinedAt|userId)`

**Behavior:**
- Return only active participants (`left_at IS NULL`)
- Order by `(joined_at ASC, user_id ASC)`

**Auth:** Must be participant

### Versioned Cache Strategy

**Problem:** Cache invalidation is hard. TTL alone causes stale reads.

**Solution:** Version-based cache with pubsub invalidation.

#### Cache Keys
```
conv:{conversationId}:part:ver      → INCR counter (e.g., "42")
conv:{conversationId}:participants:v42 → SET of userIds
```

#### Write Flow (add/remove participant)
```typescript
// 1. Update DB
await pgPool.query('INSERT INTO participants ...');

// 2. Increment version (atomic)
const newVer = await redis.incr(`conv:${convId}:part:ver`);

// 3. Publish invalidation event
await redis.publish('conv.participants.inval', JSON.stringify({
  conversationId: convId,
  version: newVer
}));

// 4. Old cache (v41) expires naturally via TTL
// New reads fetch v42 from DB and cache it
```

#### Read Flow (consumer or middleware)
```typescript
// 1. Get current version
const ver = await redis.get(`conv:${convId}:part:ver`) ?? "0";
const cacheKey = `conv:${convId}:participants:v${ver}`;

// 2. Check cache
let userIds = await redis.smembers(cacheKey);

// 3. Cache miss: fetch from DB
if (userIds.length === 0) {
  userIds = await repo.fetchActiveParticipants(convId);
  if (userIds.length) {
    await redis.sadd(cacheKey, ...userIds);
    await redis.expire(cacheKey, 300); // 5min TTL (safety net)
  }
}

return userIds;
```

#### Invalidation via Pubsub (for distributed systems)
```typescript
// Subscriber (runs in each consumer instance)
redis.subscribe('conv.participants.inval');

redis.on('message', (channel, message) => {
  const { conversationId, version } = JSON.parse(message);
  
  // Invalidate in-process cache (if any)
  inProcessCache.delete(`conv:${conversationId}:participants`);
  
  // Next read will fetch v{version} from Redis
});
```

### User → Device Mapping

**Important:** Cache userIds, not deviceIds.

**Why:** DeviceIds change frequently (connect/disconnect). UserIds are stable.

**Implementation:**
```typescript
// 1. Get participant userIds (cached)
const userIds = await getParticipants(conversationId);

// 2. Resolve to live deviceIds from WebSocket hub
const deviceIds = hub.resolveDeviceIds(userIds);

// 3. Broadcast to devices
await hub.broadcastTo(deviceIds, envelope);
```

**WebSocketHub API (required):**
```typescript
interface WebSocketHub {
  // Map userIds to currently connected deviceIds
  resolveDeviceIds(userIds: string[]): string[];
  
  // Send to specific devices
  broadcastTo(deviceIds: string[], message: object): void;
}
```

### Files to Create/Modify
- `src/app/routes/participants.ts` (~170 lines)
- `src/app/middleware/requireParticipant.ts` (~100 lines)
- `src/app/stream/participantCache.ts` (NEW, ~130 lines)
- `src/tests/unit/routes/participantsRoutes.test.ts` (~240 lines)
- `src/tests/unit/middleware/requireParticipant.test.ts` (~160 lines)

### Tests (Acceptance Criteria)
- ✅ Admin can add participants, members cannot
- ✅ Users can remove themselves
- ✅ Last participant removal soft-deletes conversation
- ✅ Version increment triggers cache invalidation
- ✅ Pubsub propagates to all consumer instances
- ✅ RLS prevents unauthorized participant list access

---

## Stage 3C: Per-User WebSocket Targeting (0.5 days) → 8.7/10

**Impact:** +0.4 points | **Effort:** 0.5 days

### Context
**Current:** Consumer broadcasts to ALL connected clients (privacy issue + inefficient)  
**Target:** Send only to conversation participants

### Current Flow
```
Outbox → Dispatcher → Redis Stream → Consumer → broadcast(ALL)
```

### Target Flow
```
Outbox → Dispatcher → Redis Stream → Consumer
  → getParticipants(conversationId)  [cached]
  → resolveDeviceIds(userIds)         [live from hub]
  → broadcastTo(deviceIds, envelope)
```

### Implementation

#### 1. Update Consumer `broadcastEvent()`

**File:** `src/app/stream/consumer.ts`

```typescript
const broadcastEvent = async (event: StreamEvent) => {
  // Idempotency check
  if (seenMessageIds.has(event.messageId)) {
    messagingMetrics.consumerDedupeSkipsTotal.inc();
    log.debug({ messageId: event.messageId }, 'duplicate_message_skipped');
    return;
  }

  try {
    // Get participant userIds (versioned cache)
    const { conversationId } = event;
    const ver = await opts.redis.get(`conv:${conversationId}:part:ver`) ?? "0";
    const cacheKey = `conv:${conversationId}:participants:v${ver}`;

    let userIds = await opts.redis.smembers(cacheKey);
    
    // Cache miss: fetch from DB
    if (userIds.length === 0) {
      const rows = await opts.pgPool.query(
        'SELECT user_id FROM messaging.participants WHERE conversation_id = $1 AND left_at IS NULL',
        [conversationId]
      );
      userIds = rows.rows.map(r => r.user_id);
      
      if (userIds.length > 0) {
        await opts.redis.sadd(cacheKey, ...userIds);
        await opts.redis.expire(cacheKey, 300); // 5min TTL
      }
    }

    // Resolve to live deviceIds
    const deviceIds = opts.hub.resolveDeviceIds(userIds);
    
    if (deviceIds.length === 0) {
      log.warn({ conversationId, userIds }, 'no_connected_devices_for_participants');
      messagingMetrics.wsMessageDroppedTotal.labels({ reason: 'no_devices' }).inc();
      return;
    }

    // Build WebSocket envelope
    const envelope = {
      v: 1 as const,
      id: randomUUID(),
      type: 'msg' as const,
      size: Buffer.byteLength(JSON.stringify(event)),
      payload: {
        seq: event.seq ?? 0,
        data: {
          messageId: event.messageId,
          conversationId: event.conversationId,
          ciphertext: event.ciphertext,
          metadata: event.metadata,
          contentSize: event.contentSize,
          contentMimeType: event.contentMimeType,
          occurredAt: event.occurredAt,
        },
      },
    };

    // Targeted broadcast
    opts.hub.broadcastTo(deviceIds, envelope);
    
    seenMessageIds.add(event.messageId);
    messagingMetrics.consumerDeliveredTotal.inc();
    messagingMetrics.wsBroadcastRecipients.set(deviceIds.length);
    
    log.info({
      messageId: event.messageId,
      conversationId: event.conversationId,
      recipients: deviceIds.length,
    }, 'message_broadcasted');
  } catch (error) {
    log.error({ err: error, messageId: event.messageId }, 'broadcast_failed');
    throw error;
  }
};
```

#### 2. Update WebSocketHub (if needed)

**File:** `packages/transport/src/websocketHub.ts`

Check if `broadcastTo(deviceIds, msg)` exists. If not, add:

```typescript
class WebSocketHub {
  private sessions = new Map<string, Set<string>>(); // userId → deviceIds

  resolveDeviceIds(userIds: string[]): string[] {
    const deviceIds: string[] = [];
    for (const userId of userIds) {
      const devices = this.sessions.get(userId) ?? new Set();
      deviceIds.push(...Array.from(devices));
    }
    return deviceIds;
  }

  broadcastTo(deviceIds: string[], message: object) {
    for (const deviceId of deviceIds) {
      const socket = this.connections.get(deviceId);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    }
  }
}
```

### Metrics (SLO Guardrails)

Add new metrics:

```typescript
// src/observability/metrics.ts

export const wsBroadcastRecipients = new Gauge({
  name: 'sanctum_ws_broadcast_recipients',
  help: 'Number of recipients per broadcast',
  labelNames: ['conversation_id']
});

export const wsMessageDroppedTotal = new Counter({
  name: 'sanctum_ws_message_dropped_total',
  help: 'Messages dropped due to no connected devices',
  labelNames: ['reason']
});
```

**SLO Alerts (per LL charter):**
- Auto-rollback if error rate >2% for 3 minutes
- Auto-rollback if p95 latency >1.5s for 3 minutes

### Files to Modify
- `src/app/stream/consumer.ts` (~80 lines changed)
- `src/app/stream/participantCache.ts` (NEW, ~130 lines)
- `packages/transport/src/websocketHub.ts` (~60 lines added)
- `src/observability/metrics.ts` (~30 lines added)
- `src/tests/integration/consumerTargeting.test.ts` (NEW, ~200 lines)

### Tests (Acceptance Criteria)
- ✅ Message sent only to participant devices
- ✅ Zero cross-conversation leakage
- ✅ Cache miss fetches from DB correctly
- ✅ Version bump invalidates cached participants
- ✅ Metrics show correct recipient counts

---

## Stage 3D: Authorization Layer (0.5 days) → 9.0/10 ✅

**Impact:** +0.3 points | **Effort:** 0.5 days

### Context
Enforce participation checks at HTTP layer for all message/conversation operations.

### Middleware Implementation

**File:** `src/app/middleware/requireParticipant.ts`

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

interface RequireParticipantOptions {
  redis: Redis;
  pgPool: Pool;
  conversationIdExtractor?: (req: FastifyRequest) => string | undefined;
}

export const requireParticipant = (opts: RequireParticipantOptions) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Extract userId from session (temporary: from X-Device-Id → session → userId)
    const userId = request.session?.userId || request.headers['x-user-id'];
    
    if (!userId) {
      return reply.code(401).send({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        requestId: request.id
      });
    }

    // Extract conversationId from request
    const conversationId = opts.conversationIdExtractor?.(request)
      || (request.body as any)?.conversationId
      || (request.params as any)?.conversationId
      || (request.params as any)?.id;

    if (!conversationId) {
      return reply.code(400).send({
        code: 'MISSING_CONVERSATION_ID',
        message: 'Conversation ID required',
        requestId: request.id
      });
    }

    // Check participation (with versioned cache)
    const isParticipant = await checkParticipation(
      userId,
      conversationId,
      opts.redis,
      opts.pgPool
    );

    if (!isParticipant) {
      // Log unauthorized attempt (1% sample)
      if (Math.random() < 0.01) {
        request.log.warn({
          userId: hashUserId(userId),
          conversationId: hashConversationId(conversationId),
          route: request.routerPath,
        }, 'unauthorized_access_attempt');
      }

      // Increment security metric
      securityMetrics.deniedTotal.labels({
        route: request.routerPath,
        reason: 'not_participant'
      }).inc();

      return reply.code(403).send({
        code: 'NOT_A_PARTICIPANT',
        message: 'You are not a participant of this conversation',
        requestId: request.id
      });
    }

    // Success: user is participant, continue to route handler
  };
};

async function checkParticipation(
  userId: string,
  conversationId: string,
  redis: Redis,
  pgPool: Pool
): Promise<boolean> {
  // Use same versioned cache as consumer
  const ver = await redis.get(`conv:${conversationId}:part:ver`) ?? "0";
  const cacheKey = `conv:${conversationId}:participants:v${ver}`;

  // Check cache
  const isCached = await redis.sismember(cacheKey, userId);
  if (isCached === 1) return true;

  // Cache miss or not found: check DB
  const result = await pgPool.query(
    'SELECT 1 FROM messaging.participants WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
    [conversationId, userId]
  );

  if (result.rowCount === 0) return false;

  // Found in DB: warm cache
  await redis.sadd(cacheKey, userId);
  await redis.expire(cacheKey, 300);

  return true;
}

function hashUserId(userId: string): string {
  return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 16);
}

function hashConversationId(conversationId: string): string {
  return crypto.createHash('sha256').update(conversationId).digest('hex').slice(0, 16);
}
```

### Apply to Routes

**File:** `src/app/routes/messages.ts`

```typescript
import { requireParticipant } from '../middleware/requireParticipant';

export const registerMessageRoutes = async (app: FastifyInstance) => {
  const authMiddleware = requireParticipant({
    redis: app.redis,
    pgPool: app.pgPool,
  });

  // Apply to all message routes
  app.post('/v1/messages', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    // Handler logic...
  });

  app.get('/v1/messages/:messageId', {
    preHandler: authMiddleware,
    config: {
      conversationIdExtractor: async (req) => {
        // Fetch message to get conversationId
        const msg = await app.messagesReadPort.findById(req.params.messageId);
        return msg?.conversationId;
      }
    }
  }, async (request, reply) => {
    // Handler logic...
  });

  app.get('/v1/conversations/:conversationId/messages', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    // Handler logic...
  });

  app.post('/v1/messages/read', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    // Handler logic...
  });
};
```

### Security Metrics

**File:** `src/observability/metrics.ts`

```typescript
export const securityMetrics = {
  deniedTotal: new Counter({
    name: 'sanctum_security_denied_total',
    help: 'Unauthorized access attempts',
    labelNames: ['route', 'reason']
  })
};
```

### Files to Create/Modify
- `src/app/middleware/requireParticipant.ts` (~100 lines)
- `src/app/routes/messages.ts` (~30 lines changed)
- `src/app/routes/conversations.ts` (~20 lines changed)
- `src/observability/metrics.ts` (~20 lines added)
- `src/tests/unit/middleware/requireParticipant.test.ts` (~160 lines)

### Tests (Acceptance Criteria)
- ✅ All routes return 403 when not a participant
- ✅ All routes return 200/201 when valid participant
- ✅ Cache hit avoids DB query
- ✅ Security metrics increment on deny
- ✅ Sampled logging works (1%)

---

## Rollout Discipline (LL Charter Compliance)

### Feature Flags

**Config:** `src/config/index.ts`

```typescript
export const messagingConfig = z.object({
  // ... existing config ...
  
  // Stage 3 feature flags
  PARTICIPANT_ENFORCEMENT_ENABLED: z.enum(['on', 'off']).default('off'),
  WS_TARGETING_ENABLED: z.enum(['on', 'off']).default('off'),
  RLS_ENABLED: z.enum('on', 'off').default('on'), // Always on for GA
});
```

### Migration Strategy (Expand-Migrate-Contract)

**Phase 1: Expand** (no breaking changes)
```sql
-- Add new columns/indexes without enforcement
ALTER TABLE messaging.conversations ADD COLUMN version INT DEFAULT 1;
CREATE INDEX ...;
```

**Phase 2: Migrate** (backfill data)
```sql
-- Update existing rows
UPDATE messaging.conversations SET version = 1 WHERE version IS NULL;
```

**Phase 3: Contract** (add constraints)
```sql
-- Make column NOT NULL
ALTER TABLE messaging.conversations ALTER COLUMN version SET NOT NULL;
```

### Rollout Sequence

1. **Day 1:** Merge Stage 3A + 3B
   - Feature flags: `PARTICIPANT_ENFORCEMENT_ENABLED=off`
   - Deploy to staging
   - Run integration tests
   
2. **Day 2:** Merge Stage 3C + 3D
   - Feature flags: `WS_TARGETING_ENABLED=off`
   - Deploy to staging
   - Verify SLO metrics (error rate, latency)

3. **Day 3:** Enable features (canary)
   - Set `WS_TARGETING_ENABLED=on` (5% traffic)
   - Monitor for 1 hour
   - If SLOs met: increase to 25%, then 100%
   - Set `PARTICIPANT_ENFORCEMENT_ENABLED=on` (same canary)

4. **Auto-Rollback Triggers:**
   - Error rate >2% for 3 consecutive minutes
   - p95 latency >1.5s for 3 consecutive minutes
   - Action: Set feature flag to `off`, alert on-call

### Tags and Versioning

```bash
# Tag format: sanctum-messaging-vX.Y.Z
git tag sanctum-messaging-v0.8.0  # Stage 3A+3B
git tag sanctum-messaging-v0.9.0  # Stage 3C+3D (9.0/10 readiness)
git tag sanctum-messaging-v1.0.0  # GA release (after Stage 4)
```

---

## Acceptance Criteria (GA-Level)

### Functional
- ✅ All new routes return 403 when not a participant; 200/201 when valid
- ✅ Direct conversations enforce de-duplication
- ✅ WS consumer sends only to participant device sessions
- ✅ Zero cross-conversation leakage in integration tests
- ✅ RLS prevents row access outside membership

### Performance
- ✅ p95 latency ≤1.5s under k6 smoke test (1k req/s)
- ✅ Error rate ≤2% sustained
- ✅ Cache hit ratio >95% for participant checks

### Observability
- ✅ SLO dashboards show metrics in Grafana
- ✅ Auto-rollback triggers fire correctly in staging
- ✅ Security denied metrics increment on 403

### Security
- ✅ RLS policies enforced at DB layer
- ✅ Authorization middleware on all protected routes
- ✅ No unauthorized access in penetration testing

---

## Files Summary

### New Files (~1,700 LOC)
- `src/app/routes/conversations.ts` (220)
- `src/app/routes/schemas/conversations.ts` (160)
- `src/app/routes/participants.ts` (170)
- `src/app/middleware/requireParticipant.ts` (100)
- `src/app/stream/participantCache.ts` (130)
- `packages/transport/src/websocketHub.ts` (additions, 60)
- `src/observability/metrics.ts` (additions, 50)

### Modified Files
- `src/app/routes/messages.ts` (~50 lines changed)
- `src/app/stream/consumer.ts` (~80 lines changed)
- `src/config/index.ts` (~30 lines changed)

### Test Files (~1,300 LOC)
- `src/tests/unit/routes/conversationsRoutes.test.ts` (320)
- `src/tests/unit/routes/participantsRoutes.test.ts` (240)
- `src/tests/unit/middleware/requireParticipant.test.ts` (160)
- `src/tests/integration/consumerTargeting.test.ts` (200)
- `src/tests/integration/rls_policies.int.test.ts` (200)
- `src/tests/integration/idempotency.int.test.ts` (180)

**Total:** ~3,000 LOC (implementation + tests)

---

## Timeline

| Day | Focus | Deliverables | Score |
|-----|-------|--------------|-------|
| 1 | Stage 3A + 3B | Conversation CRUD + Participants + RLS | 8.3/10 |
| 2 | Stage 3C + 3D | WS Targeting + Authorization | 9.0/10 ✅ |
| 3 | Testing + Rollout | Integration tests + Canary deployment | 9.0/10 |

---

## Next Steps (Stage 4 - Optional Polish)

If time permits after Stage 3:

1. **Replay on Reconnect** (+0.2)
   - `?since=<cursor>` on `/ws` endpoint
   - Fetch missed messages from outbox
   
2. **Rate Limiting** (+0.1)
   - 20 req/s per (userId, conversationId)
   - Token bucket + 429 + Retry-After
   
3. **Health Checks** (+0.1)
   - `GET /health` (liveness)
   - `GET /health/ready` (readiness)
   
4. **API Documentation** (+0.1)
   - OpenAPI 3.0 via @fastify/swagger
   - Auto-generated from Zod schemas

**Total Stage 4:** +0.5 → 9.5/10

---

## References

- [LL Charter: Tags, Flags, Rollbacks, SLOs](../../docs/ll-charter.md)
- [REPOSITORY_AUDIT_FINAL.md](../../REPOSITORY_AUDIT_FINAL.md)
- [REALTIME_RUNBOOK.md](./REALTIME_RUNBOOK.md)

---

**Document Status:** Ready for Implementation  
**Approval:** Pending  
**Last Review:** 2025-10-03

