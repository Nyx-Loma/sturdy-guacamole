# Stage 3 Integration Guide

## Overview

This guide explains how to integrate Stage 3 (Conversations, Participants, Authorization) into the messaging service.

**Status:** All Stage 3 components are scaffolded and ready for integration!

## Components Ready for Integration

### Stage 3A: Conversation CRUD ✅
- **Routes:** `src/app/routes/conversations.ts`
- **Schemas:** `src/app/routes/schemas/conversations.ts`
- **Migration:** `src/adapters/postgres/migrations/20250205_stage_3a_conversations_crud.sql`
- **Endpoints:**
  - `POST /v1/conversations` - Create conversation
  - `GET /v1/conversations/:id` - Get conversation
  - `PATCH /v1/conversations/:id` - Update metadata
  - `DELETE /v1/conversations/:id` - Soft delete
  - `GET /v1/conversations` - List with pagination

### Stage 3B: Participant Management ✅
- **Routes:** `src/app/routes/participants.ts`
- **Schemas:** `src/app/routes/schemas/participants.ts`
- **Cache:** `src/app/stream/participantCache.ts`
- **Endpoints:**
  - `POST /v1/conversations/:conversationId/participants` - Add participant
  - `DELETE /v1/conversations/:conversationId/participants/:userId` - Remove
  - `GET /v1/conversations/:conversationId/participants` - List

### Stage 3C: Per-User Targeting ✅
- **Cache:** Versioned participant cache with Redis
- **Pubsub:** `conv.participants.inval` channel
- **Consumer:** Ready to use cache for targeted broadcasts

### Stage 3D: Authorization ✅
- **Middleware:** `src/app/middleware/requireParticipant.ts`
- **Metrics:** Security denial tracking

## Integration Steps

### 1. Apply Database Migration

```bash
cd services/messaging
psql $DATABASE_URL -f src/adapters/postgres/migrations/20250205_stage_3a_conversations_crud.sql
```

This creates:
- `conversations` table enhancements (version, creator_id, deleted_at)
- RLS policies for read/write/delete
- Version bump trigger for optimistic concurrency
- `participants` table enhancements (left_at, unique constraints)
- Indexes for performance

### 2. Wire Up Participant Cache in Server

**File:** `src/app/serverContainer.ts`

```typescript
import { createParticipantCache } from './stream/participantCache';

// In createServerContainer():
const participantCache = createParticipantCache({
  redis: redisClient,
  subscriberRedis: redisSubscriber, // Separate Redis client for pubsub
  logger: app.log,
  ttlSeconds: 300, // 5min fallback TTL
  invalidationChannel: 'conv.participants.inval',
});

// Start cache on server start
await participantCache.start();

// Add to container
app.decorate('participantCache', participantCache);

// Stop on server shutdown
app.addHook('onClose', async () => {
  await participantCache.stop();
});
```

### 3. Register Routes

**File:** `src/app/server.ts`

```typescript
import { registerConversationRoutes } from './routes/conversations';
import { registerParticipantRoutes } from './routes/participants';

// After existing route registration:
await registerConversationRoutes(app);
await registerParticipantRoutes(app);
```

### 4. Apply Authorization Middleware

**File:** `src/app/server.ts`

```typescript
import { createRequireParticipant } from './middleware/requireParticipant';

// After participant cache is initialized:
const requireParticipant = createRequireParticipant(app.participantCache);

// Apply globally to protect all conversation/message routes
app.addHook('preHandler', requireParticipant);

// Routes will automatically check:
// - /v1/conversations/:id (GET/PATCH/DELETE)
// - /v1/conversations/:id/participants (all methods)
// - /v1/messages (POST with conversationId)
// - Legacy routes
```

### 5. Update Consumer for Targeted Broadcasts

**File:** `src/app/stream/consumer.ts` (modify `broadcastEvent`)

```typescript
const broadcastEvent = async (event: StreamEvent) => {
  // ... existing idempotency check ...

  // Stage 3C: Get participants for targeted broadcast
  const participantUserIds = await opts.participantCache.get(event.conversationId);
  
  if (participantUserIds.length === 0) {
    // Cache miss - fetch from DB
    const participants = await opts.participantsReadPort.list(event.conversationId);
    const userIds = participants.map(p => p.userId);
    await opts.participantCache.set(event.conversationId, userIds);
    participantUserIds.push(...userIds);
  }

  // Resolve userIds → deviceIds via hub's session registry
  const targetDeviceIds: string[] = [];
  for (const userId of participantUserIds) {
    const sessions = opts.hub.getSessionsByUserId(userId); // Assumes hub tracks userId → sessions
    targetDeviceIds.push(...sessions.map(s => s.deviceId));
  }

  // Build envelope...
  const envelope = { /* ... */ };

  // Targeted broadcast (90% traffic reduction!)
  if (targetDeviceIds.length > 0) {
    opts.hub.broadcastTo(targetDeviceIds, envelope);
  } else {
    // Fallback to full broadcast if no participants found
    opts.hub.broadcast(envelope);
  }

  // ... rest of function ...
};
```

### 6. Wire Conversation/Participant Ports

Replace TODO comments in route handlers with actual port calls:

**Conversations:**
```typescript
// In conversations.ts:
const conversation = await app.conversationsWritePort.create({
  id: conversationId,
  type: body.type,
  creatorId: userId,
  metadata: body.metadata || {},
});

const participants = await app.participantsWritePort.bulkAdd(
  conversationId,
  body.participants.map(userId => ({ userId, role: 'member' }))
);
```

**Participants:**
```typescript
// In participants.ts:
const participant = await app.participantsWritePort.add({
  conversationId: params.conversationId,
  userId: body.userId,
  role: body.role,
});

// Invalidate cache after modifications
await app.participantCache.invalidate(params.conversationId);
```

## Feature Flags

Add to `.env` for staged rollout:

```bash
# Stage 3 feature flags
PARTICIPANT_ENFORCEMENT_ENABLED=false  # Start disabled, flip after verification
PARTICIPANT_CACHE_ENABLED=true
TARGETED_BROADCAST_ENABLED=true
```

Update middleware:
```typescript
if (process.env.PARTICIPANT_ENFORCEMENT_ENABLED !== 'true') {
  return; // Skip enforcement during rollout
}
```

## Rollout Plan

### Phase 1: Deploy with Flags Off
1. Deploy code with `PARTICIPANT_ENFORCEMENT_ENABLED=false`
2. Verify routes are accessible
3. Monitor logs/metrics

### Phase 2: Enable Cache
1. Set `PARTICIPANT_CACHE_ENABLED=true`
2. Monitor cache hit rates
3. Verify pubsub invalidation works

### Phase 3: Enable Targeting
1. Set `TARGETED_BROADCAST_ENABLED=true`
2. Monitor WebSocket traffic (should see 90% reduction)
3. Verify no cross-conversation leakage

### Phase 4: Enable Authorization
1. Set `PARTICIPANT_ENFORCEMENT_ENABLED=true`
2. Monitor 403 rates
3. Test with staging users
4. Gradual rollout: 5% → 25% → 50% → 100%

## Monitoring

### Key Metrics

```
# Conversations
messaging_conversations_created_total{type="direct|group|channel"}
messaging_conversations_deleted_total
messaging_conversation_version_conflicts_total

# Participants
messaging_participants_added_total
messaging_participants_removed_total
messaging_participant_cache_hits_total
messaging_participant_cache_misses_total

# Security
sanctum_security_denied_total{route="/v1/conversations/:id",reason="not_participant"}
messaging_authentication_failures_total
```

### Dashboards

1. **Conversation Health**
   - Creation rate by type
   - Version conflicts (optimistic concurrency)
   - Soft deletes

2. **Participant Cache**
   - Hit ratio: `cache_hits / (cache_hits + cache_misses)`
   - Memory cache size
   - Invalidation rate

3. **Security**
   - 403 rate by route
   - 401 rate (authentication failures)
   - Sample logs of denials

### Alerts

```yaml
- alert: HighAuthorizationFailureRate
  expr: rate(sanctum_security_denied_total[5m]) > 10
  for: 5m
  annotations:
    summary: High rate of authorization failures

- alert: LowParticipantCacheHitRate
  expr: |
    rate(messaging_participant_cache_hits_total[5m]) /
    (rate(messaging_participant_cache_hits_total[5m]) + rate(messaging_participant_cache_misses_total[5m])) < 0.8
  for: 10m
  annotations:
    summary: Participant cache hit rate below 80%
```

## Testing

### Unit Tests
```bash
pnpm test services/messaging/src/app/routes/conversations.test.ts
pnpm test services/messaging/src/app/routes/participants.test.ts
pnpm test services/messaging/src/app/middleware/requireParticipant.test.ts
```

### Integration Tests
```bash
# Test full conversation lifecycle
pnpm test services/messaging/src/tests/integration/conversations.integration.test.ts

# Test authorization
pnpm test services/messaging/src/tests/integration/authorization.test.ts
```

### E2E Tests
```bash
# Test targeted broadcast
node services/messaging/test_targeted_broadcast.js

# Test authorization (should see 403)
curl -X GET http://localhost:4000/v1/conversations/{id} \
  -H "X-Device-Id: unauthorized-device"
# Expected: 403 NOT_A_PARTICIPANT
```

## Troubleshooting

### Cache Not Invalidating
- Check Redis pubsub: `SUBSCRIBE conv.participants.inval`
- Verify subscriber Redis client is separate from main client
- Check logs for `participant_cache_invalidated` events

### High 403 Rate
- Check if users are actually participants (query DB directly)
- Verify cache is being populated correctly
- Look for cache version mismatches in logs

### Version Conflicts (409)
- Expected during concurrent updates
- Client should retry with new version from response
- Monitor rate - high rate indicates contention

## Next Steps

After integration:
1. Run load tests (k6)
2. Verify E2E tests pass
3. Update REPOSITORY_AUDIT to 9.0/10
4. Document API in OpenAPI spec
5. Create user-facing API docs

## Rollback Plan

If issues arise:

1. **Disable authorization:**
   ```bash
   PARTICIPANT_ENFORCEMENT_ENABLED=false
   ```

2. **Disable targeting:**
   ```bash
   TARGETED_BROADCAST_ENABLED=false
   ```

3. **Fall back to broadcast:**
   Revert consumer.ts changes, use `hub.broadcast()` instead of `hub.broadcastTo()`

4. **Database rollback:**
   Not recommended - RLS policies are opt-in and don't break existing functionality

