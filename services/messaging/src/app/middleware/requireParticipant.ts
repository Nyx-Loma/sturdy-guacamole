import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ParticipantCache } from '../stream/participantCache';
import { messagingMetrics } from '../../observability/metrics';
import type { AuthContext } from '../../domain/types/auth.types';

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

  constructor(maxRequests = 100, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(key: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
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

  // Cleanup expired buckets periodically
  cleanup(): void {
    const now = Date.now();
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
async function isParticipant(
  conversationId: string,
  userId: string,
  cache: ParticipantCache,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  participantsReadPort?: any
): Promise<boolean> {
  try {
    const participantUserIds = await cache.get(conversationId);
    
    if (participantUserIds.length > 0) {
      // Cache hit
      messagingMetrics.participantCacheHits.inc();
      return participantUserIds.includes(userId);
    }
    
    // Cache miss - fetch from DB if port is available
    messagingMetrics.participantCacheMisses.inc();
    
    if (!participantsReadPort) {
      // No DB port available - FAIL CLOSED for security
      messagingMetrics.participantCacheErrors.inc();
      return false;
    }
    
    // Fetch from DB and populate cache
    try {
      const participants = await participantsReadPort.list(conversationId, { includeLeft: false });
      const userIds = participants.map((p: { userId: string }) => p.userId);
      
      // Populate cache for future requests
      await cache.set(conversationId, userIds);
      
      const isMember = userIds.includes(userId);
      
      // Negative caching: cache non-membership briefly to prevent DB spam
      if (!isMember) {
        // TODO: Implement negative caching with short TTL (30-60s)
        // This prevents repeated DB queries for attackers trying invalid conversations
      }
      
      return isMember;
    } catch (dbError) {
      // DB query failed - FAIL CLOSED
      messagingMetrics.participantCacheErrors.inc();
      throw dbError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    // CRITICAL: Any error in authorization check must DENY access
    // This prevents cache failures, DB outages, or bugs from bypassing authz
    messagingMetrics.participantCacheErrors.inc();
    
    // Log structured event for security monitoring
    console.error({
      event: 'participant_check_failed',
      conversationId,
      userId,
      error: error instanceof Error ? error.message : String(error),
      action: 'access_denied'
    });
    
    return false; // FAIL CLOSED - deny access on any error
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
  const rateLimiter = new RateLimiter(100, 60_000); // 100 req/min
  
  // Cleanup expired buckets every 5 minutes
  const cleanupInterval = setInterval(() => rateLimiter.cleanup(), 5 * 60_000);
  
  // Cleanup on process exit (for tests/graceful shutdown)
  if (typeof process !== 'undefined') {
    process.once('beforeExit', () => clearInterval(cleanupInterval));
  }

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
      messagingMetrics.authenticationFailures.inc();
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
      messagingMetrics.rateLimitExceeded.labels({
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
    const authorized = await isParticipant(
      conversationId,
      authContext.userId,
      cache,
      participantsReadPort
    );
    
    if (!authorized) {
      // User is NOT a participant - deny access
      const denyRoute = (request as { routerPath?: string }).routerPath || request.url;
      messagingMetrics.securityDeniedTotal.labels({
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
export function createRequireAdmin(cache: ParticipantCache) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // First check if they're a participant
    await createRequireParticipant(cache)(request, reply);
    
    // TODO: Check if participant has admin role
    // For now, allow all participants to be admins (will be enforced in DB/port layer)
    // const authContext = (request as any).authContext;
    // const conversationId = extractConversationId(request);
    // const isAdmin = await checkAdminRole(conversationId, authContext.userId);
    // if (!isAdmin) {
    //   return reply.code(403).send({
    //     code: 'INSUFFICIENT_PERMISSIONS',
    //     message: 'Admin role required for this operation',
    //   });
    // }
  };
}

/**
 * Special case: self-removal
 * Users can always remove themselves, even without admin role
 */
export function createRequireParticipantOrSelf(cache: ParticipantCache) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authContext = extractAuthContext(request);
    const params = request.params as Record<string, string | undefined>;
    const targetUserId = params.userId;

    // Allow if removing self
    if (authContext && targetUserId === authContext.userId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (request as any).authContext = authContext;
      return;
    }

    // Otherwise, require admin
    return createRequireAdmin(cache)(request, reply);
  };
}

