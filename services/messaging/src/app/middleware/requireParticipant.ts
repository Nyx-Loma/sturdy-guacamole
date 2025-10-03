import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ParticipantCache } from '../stream/participantCache';
import { messagingMetrics } from '../../observability/metrics';

/**
 * Authorization middleware for messaging routes
 * Stage 3D implementation
 * 
 * Enforces that the requesting user is an active participant in the conversation
 * Returns 403 NotAParticipantError if unauthorized
 * 
 * Usage:
 *   app.addHook('preHandler', requireParticipant(participantCache))
 */

export interface AuthContext {
  userId: string;
  deviceId: string;
  sessionId?: string;
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
  // TODO: Replace with proper JWT validation in Stage 4
  // For now, derive from headers (same as conversations.ts)
  const headers = request.headers as Record<string, string | undefined>;
  const deviceId = headers['x-device-id'];
  const sessionId = headers['x-session-id'];
  
  if (!deviceId) {
    return null;
  }

  // Temporary: use deviceId as userId (Stage 4 will use JWT claims)
  return {
    userId: deviceId,
    deviceId,
    sessionId,
  };
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
 * Uses participant cache for fast lookups
 */
async function isParticipant(
  conversationId: string,
  userId: string,
  cache: ParticipantCache
): Promise<boolean> {
  try {
    const participantUserIds = await cache.get(conversationId);
    
    if (participantUserIds.length > 0) {
      // Cache hit
      messagingMetrics.participantCacheHits.inc();
      return participantUserIds.includes(userId);
    }
    
    // Cache miss - need to fetch from DB
    messagingMetrics.participantCacheMisses.inc();
    
    // TODO: Fetch from DB via port in full integration
    // For now, return false (will be wired up in integration phase)
    // const participants = await participantsReadPort.list(conversationId);
    // const userIds = participants.map(p => p.userId);
    // await cache.set(conversationId, userIds);
    // return userIds.includes(userId);
    
    return false;
  } catch {
    // Log error but don't block request - fail open for now
    // In production, you may want to fail closed (return false)
    return true; // Temporary: fail open during development
  }
}

/**
 * Create authorization middleware factory
 */
export function createRequireParticipant(cache: ParticipantCache) {
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

    // Extract auth context
    const authContext = extractAuthContext(request);
    if (!authContext) {
      messagingMetrics.authenticationFailures.inc();
      return reply.code(401).send({
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authentication',
        requestId: request.id,
      });
    }

    // Extract conversationId
    const conversationId = extractConversationId(request);
    if (!conversationId) {
      // No conversationId in route - skip check
      // This handles routes that don't involve conversations
      return;
    }

    // Check if user is a participant
    const authorized = await isParticipant(conversationId, authContext.userId, cache);
    
    if (!authorized) {
      // User is NOT a participant - deny access
      messagingMetrics.securityDeniedTotal.labels({
        route: request.routerPath || request.url,
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

