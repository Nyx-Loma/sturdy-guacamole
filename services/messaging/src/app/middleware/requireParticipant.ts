import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ParticipantCache } from '../stream/participantCache';
// Metrics accessed via request.server.messagingMetrics
import type { AuthContext } from '../../domain/types/auth.types';
import { ParticipantRole } from '../../domain/types/conversation.types';

/**
 * Authorization middleware for messaging routes
 * Stage 3D implementation
 * 
 * Enforces:
 * 1. Rate limiting (100 req/min per userId)
 * 2. Authentication (userId must be present)
 * 3. Authorization (userId must be a participant in the conversation)
 * 
 * Returns:
 * - 429 if rate limit exceeded
 * - 401 if authentication fails
 * - 403 if not a participant
 * 
 * Usage:
 *   app.addHook('preHandler', requireParticipant(participantCache))
 */

/**
 * Simple in-memory rate limiter
 * Scoped by userId + route
 * Limit: 100 requests per minute per user per route
 */
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private lastSweepAt = 0;

  constructor(maxRequests = 100, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(key: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    
    // Lazy sweep: clean expired buckets every 5 minutes
    this.maybeCleanup(now);
    
    const bucket = this.buckets.get(key);

    // No bucket or expired bucket - allow and create new
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true };
    }

    // Bucket exists and not expired
    if (bucket.count >= this.maxRequests) {
      return { allowed: false, retryAfterMs: Math.max(bucket.resetAt - now, 0) };
    }

    // Increment and allow
    bucket.count += 1;
    return { allowed: true };
  }

  // Lazy cleanup: only sweep when enough time has passed
  private maybeCleanup(now = Date.now()): void {
    if (now - this.lastSweepAt >= 5 * 60_000) {
      this.cleanup(now);
      this.lastSweepAt = now;
    }
  }

  // Cleanup expired buckets
  private cleanup(now = Date.now()): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}

export interface NotAParticipantError {
  code: 'NOT_A_PARTICIPANT';
  message: string;
  conversationId: string;
  userId: string;
  requestId: string;
}

/**
 * Extract user context from request
 * In Stage 4, this will use proper JWT auth
 * For now, uses headers as temporary measure
 */
function extractAuthContext(request: FastifyRequest): AuthContext | null {
  return (request as { auth?: AuthContext }).auth ?? null;
}

/**
 * Extract conversationId from request params
 * Handles multiple route patterns:
 * - /v1/conversations/:id
 * - /v1/conversations/:conversationId/participants
 * - /v1/messages (with conversationId in body)
 */
function extractConversationId(request: FastifyRequest): string | null {
  const params = request.params as Record<string, string | undefined>;
  
  // Try common param names
  if (params.id) return params.id;
  if (params.conversationId) return params.conversationId;
  
  // Try body for POST /v1/messages
  if (request.method === 'POST' && request.body) {
    const body = request.body as Record<string, unknown>;
    if (typeof body.conversationId === 'string') {
      return body.conversationId;
    }
  }
  
  return null;
}

/**
 * Check if user is an active participant in the conversation
 * Uses participant cache for fast lookups with DB fallback
 * SECURITY: Fails closed - denies access on any error
 */
async function resolveParticipant(
  conversationId: string,
  userId: string,
  cache: ParticipantCache,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  participantsReadPort?: any
): Promise<{ isMember: boolean; role?: ParticipantRole }> {
  try {
    const participantUserIds = await cache.get(conversationId);

    if (participantUserIds.length > 0) {
      request.server.messagingMetrics.participantCacheHits.inc();
      const isMember = participantUserIds.includes(userId);
      return { isMember, role: undefined };
    }

    request.server.messagingMetrics.participantCacheMisses.inc();

    if (!participantsReadPort) {
      request.server.messagingMetrics.participantCacheErrors.inc();
      return { isMember: false };
    }

    try {
      const participants = await participantsReadPort.list(conversationId, { includeLeft: true });
      const activeParticipants = participants.filter((p: { leftAt?: string | null }) => !p.leftAt);
      const userIds = activeParticipants.map((p: { userId: string }) => p.userId);

      await cache.set(conversationId, userIds);

      const isMember = userIds.includes(userId);
      const role = participants.find((p: { userId: string; role: ParticipantRole; leftAt?: string | null }) => p.userId === userId && !p.leftAt)?.role as ParticipantRole | undefined;

      if (!isMember) {
        // TODO: Implement negative caching with short TTL (30-60s)
      }

      return { isMember, role };
    } catch (dbError) {
      request.server.messagingMetrics.participantCacheErrors.inc();
      throw dbError;
    }
  } catch (error) {
    request.server.messagingMetrics.participantCacheErrors.inc();

    console.error({
      event: 'participant_check_failed',
      conversationId,
      userId,
      error: error instanceof Error ? error.message : String(error),
      action: 'access_denied'
    });

    return { isMember: false };
  }
}

/**
 * Create authorization middleware factory
 */
export function createRequireParticipant(
  cache: ParticipantCache,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  participantsReadPort?: any
) {
  // Create rate limiter instance (shared across all requests)
  // Uses lazy cleanup - no background timers
  const rateLimiter = new RateLimiter(100, 60_000); // 100 req/min

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Skip authorization for health checks and public routes
    const publicRoutes = ['/health', '/metrics', '/v1/conversations']; // GET /v1/conversations (list) is public
    if (publicRoutes.some(route => request.url === route || request.url.startsWith(route))) {
      return;
    }

    // Skip for POST /v1/conversations (creating new conversation)
    if (request.method === 'POST' && request.url === '/v1/conversations') {
      return;
    }

    // 1. EXTRACT AUTH CONTEXT (needed for both rate limiting and authorization)
    const authContext = extractAuthContext(request);
    if (!authContext) {
      request.server.messagingMetrics.authenticationFailures.inc();
      return reply.code(401).send({
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authentication',
        requestId: request.id,
      });
    }

    // 2. RATE LIMIT CHECK (before any expensive operations)
    const route = (request as { routerPath?: string }).routerPath || request.url;
    const rateLimitKey = `${authContext.userId}:${route}`;
    const rateLimitResult = rateLimiter.check(rateLimitKey);
    
    if (!rateLimitResult.allowed) {
      request.server.messagingMetrics.rateLimitExceeded.labels({
        route,
        scope: 'userId'
      }).inc();
      
      return reply.code(429).send({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.',
        retryAfterMs: rateLimitResult.retryAfterMs,
        requestId: request.id,
      });
    }

    // 3. EXTRACT CONVERSATION ID
    const conversationId = extractConversationId(request);
    if (!conversationId) {
      // No conversationId in route - skip authorization check
      // This handles routes that don't involve conversations
      return;
    }

    // 4. AUTHORIZATION CHECK (participant verification)
    const { isMember } = await resolveParticipant(
      conversationId,
      authContext.userId,
      cache,
      participantsReadPort
    );
    
    if (!isMember) {
      // User is NOT a participant - deny access
      const denyRoute = (request as { routerPath?: string }).routerPath || request.url;
      request.server.messagingMetrics.securityDeniedTotal.labels({
        route: denyRoute,
        reason: 'not_participant'
      }).inc();
      
      // Sample 1% of denials for security monitoring
      if (Math.random() < 0.01) {
        request.log.warn({
          conversationId,
          userId: authContext.userId,
          deviceId: authContext.deviceId,
          route: request.url,
          method: request.method,
        }, 'authorization_denied');
      }

      const error: NotAParticipantError = {
        code: 'NOT_A_PARTICIPANT',
        message: 'You are not a participant in this conversation',
        conversationId,
        userId: authContext.userId,
        requestId: request.id,
      };

      return reply.code(403).send(error);
    }

    // User is authorized - proceed
    // Attach auth context to request for downstream handlers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any).authContext = authContext;
  };
}

/**
 * Middleware for routes that require admin role
 * Used for participant management (add/remove participants)
 */
export function createRequireAdmin(
  cache: ParticipantCache,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  participantsReadPort?: any
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await createRequireParticipant(cache, participantsReadPort)(request, reply);
    if (reply.sent) return;

    const authContext = extractAuthContext(request);
    const conversationId = extractConversationId(request);
    if (!authContext || !conversationId) {
      return reply.code(403).send({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Admin role required for this operation',
        requestId: request.id,
      });
    }

    const { isMember, role } = await resolveParticipant(conversationId, authContext.userId, cache, participantsReadPort);
    if (!isMember || !role || (role !== ParticipantRole.ADMIN && role !== ParticipantRole.OWNER)) {
      return reply.code(403).send({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Admin role required for this operation',
        requestId: request.id,
      });
    }
  };
}

/**
 * Special case: self-removal
 * Users can always remove themselves, even without admin role
 */
export function createRequireParticipantOrSelf(
  cache: ParticipantCache,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  participantsReadPort?: any
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authContext = extractAuthContext(request);
    const params = request.params as Record<string, string | undefined>;
    const targetUserId = params.userId;

    if (authContext && targetUserId === authContext.userId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (request as any).authContext = authContext;
      return;
    }

    return createRequireAdmin(cache, participantsReadPort)(request, reply);
  };
}

