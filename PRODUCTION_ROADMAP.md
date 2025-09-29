# 🚀 Sanctum Platform: Production Roadmap (B+ → S-Tier)

**Current Status:** B+ (GOOD) — Strong technical foundation  
**Target Status:** S-Tier (PRODUCTION-READY)  
**Timeline:** 24 weeks (6 months)  
**New Repository:** https://github.com/Nyx-Loma/sturdy-guacamole

---

## 📊 Current State Summary

### The Good ✅
- **91.29% test coverage** across 1000+ test files
- **World-class cryptography** (libsodium-based Double Ratchet)
- **2/6 services production-ready** (Auth: 8.0/10, Directory: 8.5/10)
- **Mature packages** (Crypto: 9.0/10, Transport: 8.5/10)
- **Excellent documentation** (RUNBOOK.md, GA_READINESS.md)
- **Chaos testing** (Postgres/Redis outage simulations)

### The Blockers 🔴
- **CI/CD pipeline failing** in GitHub Actions (passes locally)
- **4/6 services are scaffolds** (Messaging, Media, Backup, Admin)
- **No OpenAPI documentation** published
- **Feature flags not implemented** (required by runbook)
- **Secrets management immature** (no vault, KMS in-memory only)
- **No distributed rate limiting** (Directory uses in-process)

---

## 🎯 PHASE 0: REPOSITORY MIGRATION & CI FIX (Weeks 0-1)

### **Milestone:** Clean slate in new repo with passing CI

### **Step 0.1: Pre-Migration Checklist** (Day 1)

**Deliverables:**
- [ ] Audit current branch for uncommitted changes
- [ ] Export coverage reports and test results
- [ ] Document current CI failure patterns
- [ ] Create migration plan document
- [ ] Backup current repository (git bundle)

**Commands:**
```bash
# Check for uncommitted work
git status

# Create backup bundle
git bundle create sanctum-backup.bundle --all

# Export current coverage
cp -r coverage/ migration-artifacts/coverage-pre-migration/

# Document current state
git log --oneline -50 > migration-artifacts/recent-commits.txt
git branch -a > migration-artifacts/branches.txt
```

**Success Criteria:**
- All changes committed or documented
- Backup bundle created
- Migration artifacts saved

---

### **Step 0.2: Fix CI Pipeline** (Days 2-3) 🔴 **CRITICAL**

**Problem Analysis:**
```yaml
# Current ci.yml issues:
1. Duplicate pnpm setup (lines 64-72)
2. Service hostname resolution (postgres:5432, redis:6379)
3. Health check timing too aggressive (5s)
4. Potential race conditions in migrations
```

**Deliverables:**
- [ ] Fix duplicate pnpm setup in ci.yml
- [ ] Add DNS resolution verification
- [ ] Increase health check intervals to 10s
- [ ] Add verbose logging to wait-for-DB scripts
- [ ] Verify DATABASE_URL vs POSTGRES_URL consistency
- [ ] Add CI debug mode
- [ ] Run full test suite in GitHub Actions
- [ ] Document CI troubleshooting guide

**Implementation Plan:**

**Fix 1: Remove Duplicate pnpm Setup**
```yaml
# In .github/workflows/ci.yml, remove lines 68-72
# Keep only one pnpm setup block
```

**Fix 2: Improve Service Health Checks**
```yaml
# Update health check intervals
postgres:
  options: >-
    --health-cmd="pg_isready -U postgres -d postgres"
    --health-interval=10s        # was 5s
    --health-timeout=10s          # was 5s
    --health-retries=30           # was 20
```

**Fix 3: Enhanced Wait Scripts**
```yaml
- name: Wait for Postgres with DNS check
  run: |
    echo "Checking DNS resolution for postgres..."
    getent hosts postgres || echo "DNS not yet resolved"
    
    for i in {1..60}; do
      echo "Attempt $i: Testing Postgres connection..."
      if pg_isready -h postgres -p 5432 -U postgres; then
        echo "✅ Postgres is ready!"
        break
      fi
      sleep 3
    done
```

**Fix 4: Environment Variable Consistency**
```yaml
# Standardize on DATABASE_URL or POSTGRES_URL (not both)
env:
  DATABASE_URL: postgres://postgres:postgres@postgres:5432/postgres
  POSTGRES_URL: postgres://postgres:postgres@postgres:5432/postgres  # Keep both for compatibility
```

**Validation:**
- [ ] CI passes: Typecheck ✅
- [ ] CI passes: Lint ✅
- [ ] CI passes: Tests ✅
- [ ] CI passes: Coverage enforcement ✅
- [ ] No flaky tests (run 3 times)

**Success Criteria:**
- All GitHub Actions workflows green
- No intermittent failures over 3 consecutive runs
- CI troubleshooting guide documented

---

### **Step 0.3: Repository Migration** (Day 4) 🚀

**Pre-Migration:**
```bash
# 1. Create new repo on GitHub (done: sturdy-guacamole)
# 2. Verify CI is passing locally and in GitHub Actions
# 3. Tag current state
git tag -a v0.1.0-pre-migration -m "State before migration to sturdy-guacamole"
git push origin v0.1.0-pre-migration
```

**Migration Process:**
```bash
# 1. Clone the new repo
cd ~/Desktop
git clone https://github.com/Nyx-Loma/sturdy-guacamole.git
cd sturdy-guacamole

# 2. Add current repo as remote
git remote add source ~/Desktop/a-messages
git fetch source

# 3. Merge feat/directory-hardening-and-coverage as main
git checkout -b main
git merge source/feat/directory-hardening-and-coverage --allow-unrelated-histories

# 4. Clean up and prepare
git remote remove source
git branch -d feat/directory-hardening-and-coverage 2>/dev/null || true

# 5. Push to new repo
git push -u origin main

# 6. Create staging branch
git checkout -b staging
git push -u origin staging

# 7. Set branch protections on GitHub
# - main: require PR, passing CI, 1 approval
# - staging: require passing CI
```

**Post-Migration Checklist:**
- [ ] All files transferred correctly
- [ ] GitHub Actions workflows present in `.github/workflows/`
- [ ] CI runs automatically on push
- [ ] Branch protections configured
- [ ] README.md updated with new repo URL
- [ ] package.json "repository" field updated
- [ ] CODEOWNERS file created (optional)

**Update Documentation:**
```bash
# Update README.md badge URLs
sed -i '' 's/OWNER\/REPO/Nyx-Loma\/sturdy-guacamole/g' README.md

# Update package.json
jq '.repository.url = "git+https://github.com/Nyx-Loma/sturdy-guacamole.git"' package.json > package.json.tmp
mv package.json.tmp package.json
```

**Success Criteria:**
- New repo contains all code and history
- CI passes in new repo
- Branch protections active
- Team has access
- Old repo archived or deleted

---

### **Step 0.4: Verification & Handoff** (Day 5)

**Deliverables:**
- [ ] Run full test suite in new repo
- [ ] Verify all CI workflows pass
- [ ] Test local development environment
- [ ] Update team documentation
- [ ] Announce migration to team
- [ ] Create v0.1.0 release tag

**Release Checklist:**
```bash
# Create release tag
git tag -a v0.1.0 -m "Initial release in sturdy-guacamole
- Auth service: 8.0/10 production-ready
- Directory service: 8.5/10 production-ready  
- Crypto package: 9.0/10 mature
- Transport package: 8.5/10 mature
- 91.29% test coverage
- CI pipeline fixed and passing"

git push origin v0.1.0

# Create GitHub Release
# - Title: v0.1.0 - Foundation Release
# - Notes: Include audit summary from PRODUCTION_ROADMAP.md
# - Attach: sanctum-backup.bundle (from old repo)
```

**Success Criteria:**
- ✅ New repo fully operational
- ✅ CI passing consistently
- ✅ Team onboarded
- ✅ v0.1.0 released

---

## 🏗️ PHASE 1: STABILIZE FOUNDATION (Weeks 1-4)

### **Milestone:** 2 production-ready services with complete documentation

### **Week 1: Directory Service Completion**

**Deliverables:**
- [ ] **1.1:** Implement Postgres repository migrations
- [ ] **1.2:** Replace in-process rate limiter with Redis-backed
- [ ] **1.3:** Add OpenAPI spec with @fastify/swagger
- [ ] **1.4:** Write directory-specific runbook
- [ ] **1.5:** Add contract tests (Pact or OpenAPI validation)
- [ ] **1.6:** Integration tests with Postgres + Redis
- [ ] **1.7:** Performance test (k6): 1000 req/s sustained

**Code Changes:**

**1.1: Postgres Migrations**
```sql
-- services/directory/migrations/001_init.sql
CREATE TABLE IF NOT EXISTS directory_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle VARCHAR(255) UNIQUE NOT NULL,
    handle_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 of lowercase handle
    public_key BYTEA NOT NULL,
    device_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_directory_handle_hash ON directory_entries(handle_hash);
CREATE INDEX idx_directory_device_id ON directory_entries(device_id);
```

**1.2: Redis Rate Limiter**
```typescript
// services/directory/src/app/rateLimiter.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';

export function createRateLimiter(redis: Redis) {
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'directory_rl',
    points: 100, // requests
    duration: 60, // per 60 seconds
  });
}
```

**Success Criteria:**
- Directory service: 9.0/10
- All tests passing with real Postgres
- OpenAPI spec published
- Rate limiter handles 1000 req/s

---

### **Week 2: Auth Service Hardening**

**Deliverables:**
- [ ] **2.1:** Add OpenAPI spec with @fastify/swagger
- [ ] **2.2:** Enforce 90% per-file coverage (all modules)
- [ ] **2.3:** Complete auth-specific runbook
- [ ] **2.4:** Add contract tests
- [ ] **2.5:** Performance test: 500 logins/s sustained
- [ ] **2.6:** Chaos test: Redis failover recovery
- [ ] **2.7:** Document secret rotation procedures

**OpenAPI Implementation:**
```typescript
// services/auth/src/app/server.ts
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

await fastify.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'Sanctum Auth API',
      version: '1.0.0',
      description: 'Anonymous authentication and device management'
    },
    servers: [{ url: 'https://auth.sanctum.app' }]
  }
});

await fastify.register(fastifySwaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  }
});
```

**Success Criteria:**
- Auth service: 9.0/10
- OpenAPI docs accessible at `/docs`
- All coverage thresholds met
- Performance targets achieved

---

### **Week 3: Feature Flags System**

**Deliverables:**
- [ ] **3.1:** Evaluate flag providers (LaunchDarkly, Unleash, custom)
- [ ] **3.2:** Design flag schema and SDK
- [ ] **3.3:** Implement flag provider adapter
- [ ] **3.4:** Integrate into auth service
- [ ] **3.5:** Integrate into directory service
- [ ] **3.6:** Add admin UI (basic)
- [ ] **3.7:** Write feature flag testing guide
- [ ] **3.8:** Document flag naming conventions

**Design Decision:**
```typescript
// packages/feature-flags/src/index.ts
export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercentage?: number;
  userAllowlist?: string[];
  environment: 'dev' | 'staging' | 'prod';
}

export interface FlagProvider {
  isEnabled(flagKey: string, context?: FlagContext): Promise<boolean>;
  getAllFlags(): Promise<FeatureFlag[]>;
}

// Simple Redis-backed implementation
export class RedisFlagProvider implements FlagProvider {
  constructor(private redis: Redis) {}
  
  async isEnabled(flagKey: string, context?: FlagContext): Promise<boolean> {
    const flag = await this.redis.get(`flag:${flagKey}`);
    if (!flag) return false; // Default OFF
    const parsed: FeatureFlag = JSON.parse(flag);
    // Evaluate rollout percentage, allowlist, etc.
    return this.evaluateFlag(parsed, context);
  }
}
```

**Integration Pattern:**
```typescript
// services/auth/src/usecases/auth/login.ts
export async function login(req: LoginRequest) {
  // Default OFF, can enable per-user or percentage
  const enhancedSecurityEnabled = await flags.isEnabled(
    'auth.enhanced-security',
    { userId: req.userId }
  );
  
  if (enhancedSecurityEnabled) {
    // New feature path
  } else {
    // Legacy stable path
  }
}
```

**Success Criteria:**
- Feature flag system operational
- Integrated in auth + directory
- Admin UI for flag management
- Default-off enforced

---

### **Week 4: Secrets Management & KMS**

**Deliverables:**
- [ ] **4.1:** Choose secrets vault (AWS Secrets Manager recommended)
- [ ] **4.2:** Implement secrets provider interface
- [ ] **4.3:** Migrate JWT secrets to vault
- [ ] **4.4:** Migrate database credentials to vault
- [ ] **4.5:** Implement KMS integration (replace in-memory)
- [ ] **4.6:** Add rotation procedures (automated)
- [ ] **4.7:** Document emergency rotation runbook
- [ ] **4.8:** Test rotation in staging

**Architecture:**
```typescript
// packages/secrets/src/provider.ts
export interface SecretsProvider {
  getSecret(key: string): Promise<string>;
  setSecret(key: string, value: string): Promise<void>;
  rotateSecret(key: string): Promise<void>;
}

// AWS implementation
export class AWSSecretsProvider implements SecretsProvider {
  constructor(private client: SecretsManagerClient) {}
  
  async getSecret(key: string): Promise<string> {
    const response = await this.client.send(
      new GetSecretValueCommand({ SecretId: key })
    );
    return response.SecretString!;
  }
  
  async rotateSecret(key: string): Promise<void> {
    await this.client.send(
      new RotateSecretCommand({ SecretId: key })
    );
  }
}
```

**Rotation Automation:**
```typescript
// scripts/rotate-secrets.ts
async function rotateJWTSecret() {
  const newSecret = crypto.randomBytes(32).toString('base64');
  
  // Store new secret with version
  await secretsProvider.setSecret('jwt-secret-v2', newSecret);
  
  // Update config to use new secret (blue-green)
  await updateServiceConfig('JWT_SECRET', 'jwt-secret-v2');
  
  // Wait for rollout (24h grace period)
  await sleep(24 * 60 * 60 * 1000);
  
  // Deprecate old secret
  await secretsProvider.setSecret('jwt-secret-v1', 'DEPRECATED');
}
```

**Success Criteria:**
- All secrets in vault
- KMS integrated (crypto operations use KMS keys)
- Rotation procedures automated
- Emergency rotation tested

---

## 🛠️ PHASE 2: CORE SERVICES (Weeks 5-16)

### **Milestone:** 5/6 services production-ready

### **Weeks 5-10: Messaging Service**

**Deliverables:**
- [ ] **5.1:** Define message schema (protobuf or zod)
- [ ] **5.2:** Implement Postgres storage (partitioned by date)
- [ ] **5.3:** Add idempotency layer (deduplication)
- [ ] **5.4:** Integrate transport WebSocket hub
- [ ] **5.5:** Add Redis Streams for fan-out
- [ ] **5.6:** Implement delivery guarantees (at-least-once)
- [ ] **5.7:** Add acknowledgement handling
- [ ] **5.8:** Property tests (message ordering, loss)
- [ ] **5.9:** Chaos tests (Redis outage, network partition)
- [ ] **5.10:** OpenAPI spec
- [ ] **5.11:** Operational runbook
- [ ] **5.12:** Performance: 10k messages/s

**Architecture:**
```
┌─────────────┐    WebSocket     ┌──────────────┐
│   Client    │ ←──────────────→ │  Transport   │
└─────────────┘                  │   Package    │
                                 └──────────────┘
                                        ↓
                                 ┌──────────────┐
                                 │  Messaging   │
                                 │   Service    │
                                 └──────────────┘
                                   ↓         ↓
                         ┌─────────┴─┐   ┌──┴─────────┐
                         │ Postgres  │   │   Redis    │
                         │(messages) │   │  Streams   │
                         └───────────┘   └────────────┘
```

**Message Schema:**
```typescript
export interface Message {
  id: string; // UUID
  conversationId: string;
  senderId: string;
  recipientIds: string[];
  encryptedPayload: Uint8Array; // E2EE envelope from crypto package
  timestamp: Date;
  sequence: number; // For ordering
  idempotencyKey: string; // Client-provided for dedup
}
```

**Storage Strategy:**
```sql
-- Partitioned by month for performance
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    encrypted_payload BYTEA NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    sequence BIGINT NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL
) PARTITION BY RANGE (timestamp);

CREATE TABLE messages_2025_09 PARTITION OF messages
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
```

**Success Criteria:**
- Messaging service: 8.5/10
- 10k messages/s sustained
- Zero message loss in tests
- Ordering guarantees validated

---

### **Weeks 9-14: Media Service**

**Deliverables:**
- [ ] **9.1:** S3/compatible storage adapter
- [ ] **9.2:** Upload API with pre-signed URLs
- [ ] **9.3:** Download API with time-limited tokens
- [ ] **9.4:** Encryption-at-rest (AES-256-GCM)
- [ ] **9.5:** ClamAV virus scanning integration
- [ ] **9.6:** Chunked upload (multipart)
- [ ] **9.7:** Resumable upload (RFC 5789 PATCH)
- [ ] **9.8:** Content-Type validation
- [ ] **9.9:** Size limits (config-driven)
- [ ] **9.10:** TTL enforcement (automatic deletion)
- [ ] **9.11:** OpenAPI spec
- [ ] **9.12:** Operational runbook
- [ ] **9.13:** Performance: 100 MB/s upload

**Architecture:**
```typescript
// services/media/src/domain/types.ts
export interface MediaUpload {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  encryptedKey: Uint8Array; // Encrypted with user's key
  storageKey: string; // S3 object key
  virusScanStatus: 'pending' | 'clean' | 'infected';
  expiresAt: Date;
  createdAt: Date;
}
```

**Upload Flow:**
```typescript
// 1. Client requests upload URL
POST /media/upload/init
{
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 2048576,
  "ttlHours": 24
}

// 2. Server generates pre-signed URL
Response:
{
  "uploadId": "uuid",
  "uploadUrl": "https://s3.../presigned-url",
  "encryptionKey": "base64-aes-key", // Client-generated, wrapped
  "expiresAt": "2025-09-30T12:00:00Z"
}

// 3. Client encrypts file and uploads to S3 directly
PUT uploadUrl
Body: encrypted file chunks

// 4. Client confirms upload
POST /media/upload/{uploadId}/complete

// 5. Server triggers virus scan (async)
// 6. Server returns download token once clean
```

**Success Criteria:**
- Media service: 8.0/10
- 100 MB/s upload sustained
- Virus scanning operational
- Resumable uploads working

---

### **Weeks 11-16: Backup Service**

**Deliverables:**
- [ ] **11.1:** Backup schema design
- [ ] **11.2:** Leverage crypto/backup/derive.ts
- [ ] **11.3:** Object storage adapter (S3)
- [ ] **11.4:** Backup API (initiate, list, verify)
- [ ] **11.5:** Restore API with integrity checks
- [ ] **11.6:** Encryption with user master key
- [ ] **11.7:** Retention policies (config-driven)
- [ ] **11.8:** PITR for databases (separate concern)
- [ ] **11.9:** Disaster recovery drills (automated)
- [ ] **11.10:** OpenAPI spec
- [ ] **11.11:** Operational runbook
- [ ] **11.12:** Recovery time: <5 minutes

**Backup Schema:**
```typescript
export interface AccountBackup {
  id: string;
  userId: string;
  deviceId: string;
  encryptedBlob: Uint8Array; // Contains sessions, keys, metadata
  backupKey: Uint8Array; // Derived from recovery code
  integrityHash: string; // HMAC-SHA256
  version: number;
  createdAt: Date;
  expiresAt?: Date;
}
```

**Disaster Recovery Test:**
```typescript
// Automated DR drill (runs weekly)
async function disasterRecoveryDrill() {
  // 1. Create test account with data
  const account = await createTestAccount();
  
  // 2. Initiate backup
  const backup = await backupService.initiate(account.id);
  
  // 3. Simulate total data loss
  await deleteAllUserData(account.id);
  
  // 4. Restore from backup
  const restored = await backupService.restore(backup.id);
  
  // 5. Verify data integrity
  expect(restored).toEqual(account);
  
  // 6. Measure recovery time
  expect(recoveryTime).toBeLessThan(5 * 60 * 1000); // 5 minutes
}
```

**Success Criteria:**
- Backup service: 8.5/10
- Recovery time <5 minutes
- 100% restore success rate in tests
- Automated DR drills passing

---

## 🎖️ PHASE 3: OPERATIONAL EXCELLENCE (Weeks 17-20)

### **Milestone:** Full observability and operational tooling

### **Weeks 17-18: Admin Service**

**Deliverables:**
- [ ] **17.1:** Define admin scope (feature flags UI, metrics dashboards, user support)
- [ ] **17.2:** Implement RBAC (admin, operator, viewer roles)
- [ ] **17.3:** Audit logging (all admin actions)
- [ ] **17.4:** Feature flags management UI
- [ ] **17.5:** User account search/management
- [ ] **17.6:** System health dashboard
- [ ] **17.7:** OpenAPI spec
- [ ] **17.8:** Security audit (penetration test)
- [ ] **17.9:** Operational runbook

**Admin Scope:**
- Feature flag management (toggle, rollout percentage)
- User account tools (search, view, suspend)
- System metrics dashboard (embed Grafana)
- Service health status (all 6 services)
- Audit log viewer

**RBAC Implementation:**
```typescript
export enum AdminRole {
  SUPER_ADMIN = 'super_admin', // Full access
  OPERATOR = 'operator',        // Deploy, restart services
  SUPPORT = 'support',          // View user data
  VIEWER = 'viewer'             // Read-only metrics
}

export interface AdminPermission {
  resource: string; // 'feature_flags', 'users', 'services'
  action: 'read' | 'write' | 'delete';
}
```

**Success Criteria:**
- Admin service: 8.0/10
- RBAC enforced
- All actions audit-logged
- Security audit passed

---

### **Week 19: Observability Stack**

**Deliverables:**
- [ ] **19.1:** Deploy Prometheus + Grafana
- [ ] **19.2:** Create dashboards (1 per service)
- [ ] **19.3:** Define SLOs (availability, latency, error rate)
- [ ] **19.4:** Configure alerting rules
- [ ] **19.5:** Implement distributed tracing (Jaeger/Tempo)
- [ ] **19.6:** Add correlation IDs to all logs
- [ ] **19.7:** Deploy log aggregation (Loki/ELK)
- [ ] **19.8:** Create on-call runbook

**SLO Definitions:**
```yaml
# Auth Service SLOs
availability: 99.9%          # Max 43 minutes downtime/month
latency_p95: 200ms          # 95% of requests < 200ms
latency_p99: 500ms          # 99% of requests < 500ms
error_rate: 0.1%            # <1 error per 1000 requests
successful_logins: 99%      # Account for invalid credentials

# Messaging Service SLOs
availability: 99.95%        # Max 21 minutes downtime/month
message_delivery_time: 1s   # P95 < 1 second
message_loss_rate: 0%       # Zero tolerance
ordering_guarantee: 100%    # Always in order
```

**Alert Rules:**
```yaml
# Prometheus alerting rules
groups:
  - name: auth_service
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.02
        for: 3m
        annotations:
          summary: "Error rate >2% for 3 minutes"
          runbook_url: "https://runbook.sanctum.app/auth/high-error-rate"
      
      - alert: HighLatency
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 1.5
        for: 3m
        annotations:
          summary: "P95 latency >1.5s for 3 minutes"
          action: "Consider auto-rollback"
```

**Grafana Dashboards:**
1. **System Overview** — All services health, traffic, error rates
2. **Auth Service** — Logins/s, token validation, error breakdown
3. **Directory Service** — Lookups/s, cache hit rate, rate limit blocks
4. **Messaging Service** — Messages/s, queue depth, delivery latency
5. **Media Service** — Uploads/s, storage usage, virus scan queue
6. **Backup Service** — Backups/day, restore requests, DR drill results

**Success Criteria:**
- All services instrumented
- Dashboards deployed
- Alerts firing correctly (test in staging)
- On-call rotation established

---

### **Week 20: Security Hardening**

**Deliverables:**
- [ ] **20.1:** Penetration testing (external firm)
- [ ] **20.2:** Threat modeling (all services)
- [ ] **20.3:** Security audit (code review)
- [ ] **20.4:** Implement WAF rules (Cloudflare/AWS WAF)
- [ ] **20.5:** Add DDoS protection
- [ ] **20.6:** Configure CSP headers (all services)
- [ ] **20.7:** Implement mTLS between services
- [ ] **20.8:** Add security headers (HSTS, X-Frame-Options)
- [ ] **20.9:** Document incident response plan
- [ ] **20.10:** Security training for team

**Security Checklist:**
- [ ] All secrets in vault (AWS Secrets Manager)
- [ ] KMS encryption for data at rest
- [ ] TLS 1.3 enforced
- [ ] mTLS between internal services
- [ ] Rate limiting at edge (Cloudflare)
- [ ] WAF rules deployed
- [ ] DDoS protection active
- [ ] Security headers configured
- [ ] Dependency scanning (Dependabot)
- [ ] SBOM generated and published
- [ ] Penetration test report received
- [ ] All high/critical vulns remediated

**Success Criteria:**
- Penetration test passed
- Zero high/critical vulnerabilities
- Incident response plan documented
- Team trained on security procedures

---

## 🚀 PHASE 4: PRODUCTION READINESS (Weeks 21-24)

### **Milestone:** Platform ready for GA launch

### **Week 21: Infrastructure as Code**

**Deliverables:**
- [ ] **21.1:** Choose platform (Kubernetes, AWS ECS, Railway)
- [ ] **21.2:** Write IaC (Terraform or Pulumi)
- [ ] **21.3:** Multi-region deployment strategy
- [ ] **21.4:** Load balancer configuration
- [ ] **21.5:** Auto-scaling policies (CPU, memory, queue depth)
- [ ] **21.6:** Database replication (read replicas)
- [ ] **21.7:** Redis clustering
- [ ] **21.8:** S3 multi-region replication
- [ ] **21.9:** Backup automation
- [ ] **21.10:** Disaster recovery plan

**Kubernetes Manifests (Example):**
```yaml
# services/auth/k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  namespace: sanctum
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
        version: v1.0.0
    spec:
      containers:
      - name: auth
        image: ghcr.io/nyx-loma/sanctum-auth:v1.0.0
        ports:
        - containerPort: 8081
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: database-url
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8081
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8081
          initialDelaySeconds: 10
          periodSeconds: 5
```

**Auto-scaling:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: auth-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: auth-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**Success Criteria:**
- IaC deployed to staging
- All services running in Kubernetes
- Auto-scaling tested
- Multi-region failover validated

---

### **Week 22: Documentation Completion**

**Deliverables:**
- [ ] **22.1:** Publish OpenAPI specs (all 6 services)
- [ ] **22.2:** Create architecture diagrams (C4 model)
- [ ] **22.3:** Write API tutorials (getting started)
- [ ] **22.4:** Document authentication flows
- [ ] **22.5:** Create client SDK examples (JS, Python, Go)
- [ ] **22.6:** Write contribution guide
- [ ] **22.7:** Write testing guide
- [ ] **22.8:** Document deployment procedures
- [ ] **22.9:** Create troubleshooting guide
- [ ] **22.10:** Write incident response playbook

**Documentation Structure:**
```
docs/
├── README.md                    # Overview
├── architecture/
│   ├── system-context.md        # C4 Level 1
│   ├── container-diagram.md     # C4 Level 2
│   ├── components/              # C4 Level 3 per service
│   └── data-flow.md
├── api/
│   ├── authentication.md
│   ├── directory.md
│   ├── messaging.md
│   ├── media.md
│   ├── backup.md
│   └── admin.md
├── guides/
│   ├── getting-started.md
│   ├── client-integration.md
│   ├── e2ee-setup.md
│   └── feature-flags.md
├── operations/
│   ├── deployment.md
│   ├── monitoring.md
│   ├── incident-response.md
│   ├── disaster-recovery.md
│   └── security.md
├── development/
│   ├── contributing.md
│   ├── testing.md
│   ├── local-setup.md
│   └── ci-cd.md
└── runbooks/
    ├── auth-service.md
    ├── directory-service.md
    ├── messaging-service.md
    ├── media-service.md
    ├── backup-service.md
    └── admin-service.md
```

**Success Criteria:**
- All documentation published
- External developers can integrate
- Internal team can deploy
- On-call can respond to incidents

---

### **Week 23: Performance & Load Testing**

**Deliverables:**
- [ ] **23.1:** Load test all services (k6 scripts)
- [ ] **23.2:** Stress test (find breaking points)
- [ ] **23.3:** Soak test (24-hour runs)
- [ ] **23.4:** Spike test (sudden traffic surges)
- [ ] **23.5:** Capacity planning (cost modeling)
- [ ] **23.6:** Performance tuning
- [ ] **23.7:** Database query optimization
- [ ] **23.8:** Cache warming strategies
- [ ] **23.9:** CDN configuration
- [ ] **23.10:** Performance report

**Load Test Scenarios:**
```javascript
// k6/load-test-auth.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '5m', target: 100 },   // Ramp up
    { duration: '10m', target: 1000 }, // Sustained load
    { duration: '5m', target: 2000 },  // Spike
    { duration: '10m', target: 1000 }, // Cool down
    { duration: '5m', target: 0 },     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.01'],
  }
};

export default function() {
  // Login flow
  let res = http.post('https://auth.sanctum.app/auth/login', {
    deviceId: 'test-device',
    assertion: 'test-signature'
  });
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has JWT token': (r) => r.json('token') !== undefined,
  });
}
```

**Performance Targets:**
- Auth: 500 logins/s, p95 < 200ms
- Directory: 1000 lookups/s, p95 < 100ms
- Messaging: 10k messages/s, p95 < 500ms
- Media: 100 MB/s upload, 500 MB/s download
- Backup: 100 backups/s, restore < 5min

**Success Criteria:**
- All performance targets met
- No degradation under sustained load
- Clear capacity limits documented
- Cost model completed

---

### **Week 24: Launch Preparation**

**Deliverables:**
- [ ] **24.1:** Gradual rollout plan (5% → 25% → 100%)
- [ ] **24.2:** Rollback procedures tested
- [ ] **24.3:** On-call rotation established
- [ ] **24.4:** Post-launch monitoring plan
- [ ] **24.5:** Customer communication plan
- [ ] **24.6:** Status page setup (status.sanctum.app)
- [ ] **24.7:** Support documentation
- [ ] **24.8:** GA readiness review (final audit)
- [ ] **24.9:** Launch checklist
- [ ] **24.10:** GO/NO-GO decision

**Launch Checklist:**

**Infrastructure:**
- [ ] All services deployed to production
- [ ] Database backups automated
- [ ] Redis clustering configured
- [ ] Load balancers healthy
- [ ] Auto-scaling tested
- [ ] Multi-region replication active
- [ ] CDN configured
- [ ] TLS certificates valid

**Monitoring:**
- [ ] Prometheus scraping all services
- [ ] Grafana dashboards deployed
- [ ] Alerts configured
- [ ] PagerDuty integrated
- [ ] Status page operational
- [ ] Log aggregation working

**Security:**
- [ ] Penetration test passed
- [ ] All secrets in vault
- [ ] WAF rules active
- [ ] DDoS protection enabled
- [ ] Security headers configured
- [ ] Audit logging enabled

**Documentation:**
- [ ] API docs published
- [ ] Integration guides complete
- [ ] Runbooks finalized
- [ ] Incident response plan documented
- [ ] Support docs ready

**Team:**
- [ ] On-call rotation staffed
- [ ] Team trained on procedures
- [ ] Emergency contacts documented
- [ ] Communication plan ready

**Testing:**
- [ ] All tests passing (10,000+ tests)
- [ ] Load tests passed
- [ ] Chaos tests passed
- [ ] DR drill successful

**Compliance:**
- [ ] GDPR requirements met
- [ ] Data retention policies configured
- [ ] Privacy policy published
- [ ] Terms of service published

**Rollout Plan:**
```markdown
## Phase 1: 5% (Day 1-3)
- Deploy to 5% of traffic
- Monitor error rates, latency, resource usage
- Manual verification of core flows
- Daily team sync

**GO/NO-GO Criteria:**
- Error rate < 0.1%
- P95 latency < 200ms
- No critical bugs
- All monitors green

## Phase 2: 25% (Day 4-7)
- Increase to 25% of traffic
- Continue monitoring
- Collect user feedback
- Daily team sync

## Phase 3: 100% (Day 8+)
- Full rollout
- Post-launch monitoring (48h intensive)
- Weekly retrospective
```

**Success Criteria:**
- Launch readiness: 100%
- All checklist items complete
- GO decision approved
- Launch date scheduled

---

## 📊 SUCCESS METRICS

### **Technical Metrics:**
- **Test Coverage:** 95%+ (currently 91.29%)
- **CI/CD:** 100% pass rate, <10 min runs
- **Services:** 6/6 production-ready (currently 2/6)
- **Documentation:** 100% of APIs documented
- **Performance:** All SLOs met
- **Security:** Zero high/critical vulnerabilities

### **Operational Metrics:**
- **Deployment Frequency:** Daily to staging, weekly to prod
- **Change Failure Rate:** <5%
- **MTTR (Mean Time to Recover):** <30 minutes
- **Service Availability:** 99.9%+ (Auth, Directory, Messaging)
- **Incident Count:** <2 per month (high-severity)

### **Business Metrics:**
- **Platform Readiness:** S-Tier (90%+)
- **Developer Onboarding:** <1 hour to first API call
- **Support Ticket Volume:** <10 per week
- **Customer Satisfaction:** >90%

---

## 🎯 CRITICAL SUCCESS FACTORS

### **Must Have for S-Tier:**
1. ✅ **CI/CD Pipeline:** Passing consistently, <10 min runs
2. ✅ **All Services Production-Ready:** 6/6 at 8.0/10 or higher
3. ✅ **Complete Documentation:** API docs, runbooks, guides
4. ✅ **Observability:** Dashboards, alerts, tracing
5. ✅ **Security:** Penetration test passed, all secrets in vault
6. ✅ **Performance:** All SLOs met under load
7. ✅ **Operational Readiness:** On-call trained, DR drills passing

### **Nice to Have (Can defer):**
- Client SDKs (JS, Python, Go) — can be community-driven
- GraphQL API — REST + WebSocket sufficient initially
- Multi-language support — English-first is acceptable
- Advanced analytics — basic metrics sufficient

---

## 🚨 RISK MITIGATION

### **Risk 1: Timeline Overrun**
**Probability:** Medium  
**Impact:** High  
**Mitigation:**
- Build MVPs first, iterate later
- Parallelize work across services
- De-scope nice-to-haves
- Add buffer to critical path items

### **Risk 2: CI/CD Issues Persist**
**Probability:** Low (we're fixing in Phase 0)  
**Impact:** Critical  
**Mitigation:**
- Allocate Week 1 buffer if CI fix takes longer
- Consider GitHub-hosted runners (more resources)
- Worst-case: Switch to CircleCI/GitLab CI

### **Risk 3: Scope Creep**
**Probability:** High  
**Impact:** Medium  
**Mitigation:**
- Strict scope definition per service
- RFC process for new features
- Feature flags (defer features, don't block launch)
- Bi-weekly roadmap reviews

### **Risk 4: Key Team Member Unavailable**
**Probability:** Medium  
**Impact:** High  
**Mitigation:**
- Document everything
- Pair programming on critical components
- Cross-training (everyone knows ≥2 services)
- External consultants as backup

### **Risk 5: Security Vulnerability Discovered**
**Probability:** Low  
**Impact:** Critical  
**Mitigation:**
- Continuous security scanning (CodeQL, Dependabot)
- Quarterly penetration tests
- Bug bounty program
- Incident response plan tested

---

## 📅 TIMELINE VISUALIZATION

```
Week 0  |████| CI Fix & Repo Migration → sturdy-guacamole
Week 1  |████| Directory Service Completion
Week 2  |████| Auth Service Hardening
Week 3  |████| Feature Flags Implementation
Week 4  |████| Secrets Management & KMS
        └────────────────────────────────────────────────
Week 5  |████████████████████████| Messaging Service (6 weeks)
Week 9  |████████████████████| Media Service (6 weeks)
Week 11 |████████████████| Backup Service (6 weeks)
        └────────────────────────────────────────────────
Week 17 |████████| Admin Service (2 weeks)
Week 19 |████| Observability Stack (1 week)
Week 20 |████| Security Hardening (1 week)
        └────────────────────────────────────────────────
Week 21 |████| Infrastructure as Code (1 week)
Week 22 |████| Documentation Completion (1 week)
Week 23 |████| Performance & Load Testing (1 week)
Week 24 |████| Launch Preparation (1 week)
        └────────────────────────────────────────────────
        🚀 LAUNCH: S-Tier Production-Ready Platform
```

---

## 🎓 LESSONS LEARNED (Pre-Launch)

### **What Went Well:**
- Strong cryptographic foundation (saved months of work)
- Comprehensive testing culture (91%+ coverage)
- Excellent documentation (RUNBOOK.md, GA_READINESS.md)
- Clean architecture (easy to extend)

### **What Could Be Improved:**
- CI/CD setup earlier (avoid GitHub Actions pain)
- OpenAPI from day 1 (contract-first development)
- Feature flags from day 1 (required by runbook anyway)
- More focus on production services (less scaffolding)

### **Recommendations for Next Project:**
1. Set up CI/CD before writing code
2. Contract-first API design (OpenAPI specs first)
3. Feature flags as core infrastructure
4. Fewer scaffolds, more MVPs
5. Weekly production readiness reviews

---

## 📞 SUPPORT & ESCALATION

### **During Migration (Phase 0):**
- **Point Person:** [Your Name]
- **Slack Channel:** #sanctum-migration
- **Emergency Contact:** [Phone/Email]

### **During Development (Phases 1-4):**
- **Project Lead:** [Your Name]
- **Tech Lead:** [Name]
- **DevOps Lead:** [Name]
- **Security Lead:** [Name]

### **Post-Launch:**
- **On-Call Rotation:** PagerDuty
- **Escalation Path:** On-Call → Tech Lead → CTO
- **War Room:** #sanctum-incidents

---

## 🏁 FINAL CHECKLIST (Pre-Launch)

**Before GO Decision:**
- [ ] All 24 weeks completed
- [ ] All deliverables checked off
- [ ] Launch checklist 100% complete
- [ ] GO/NO-GO review meeting held
- [ ] Customer communication sent
- [ ] Status page live
- [ ] On-call staffed
- [ ] Champagne purchased 🍾

**GO Decision Criteria:**
- [ ] 6/6 services at 8.0/10 or higher
- [ ] CI/CD passing consistently
- [ ] All performance targets met
- [ ] Security audit passed
- [ ] DR drills successful
- [ ] Documentation complete
- [ ] Team trained and ready

**When all boxes checked: LAUNCH! 🚀**

---

## 🎉 CONCLUSION

This roadmap transforms Sanctum from **B+ (GOOD)** to **S-Tier (PRODUCTION-READY)** in 24 weeks. The foundation is already strong—excellent crypto, solid testing, clean architecture. Now we execute systematically:

1. **Fix CI** (Week 0)
2. **Migrate to new repo** (Week 0)
3. **Complete existing services** (Weeks 1-4)
4. **Build core services** (Weeks 5-16)
5. **Operational excellence** (Weeks 17-20)
6. **Production readiness** (Weeks 21-24)
7. **LAUNCH** 🚀

**The platform is 55% ready.** With focused execution, we'll reach **90%+ production readiness** and launch a world-class E2EE messaging platform.

**Let's build something great.** 💪

---

**Document Version:** 1.0  
**Last Updated:** September 29, 2025  
**Next Review:** After Phase 0 completion  
**Owner:** Technical Leadership Team
