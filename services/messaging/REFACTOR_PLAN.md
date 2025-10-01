# Messaging Service: Port-Based Architecture Refactor

**Problem:** 25 methods in repositories = wrong boundaries. Need to split by capability and lifecycle.

**Goal:** Each port ≤ 6 functions. Enforce with tooling. Cut 30-60% of methods.

---

## Current State Analysis

### Messages Repository (11 methods) → TOO MANY

**Commands (Write):**
- `create` - Create message ✓
- `updateStatus` - Update status ✓
- `softDelete` - Mark deleted ✓
- `markAsRead` - Bulk read status ✓
- `deleteByConversation` - Admin cleanup ⚠️ (admin port?)

**Queries (Read):**
- `findById` - Get by ID ✓
- `findByConversation` - List with filters ✓
- `findByClientId` - Idempotency check ⚠️ (merge with create?)
- `countByConversation` - Count ✓
- `getLatestByConversation` - Latest message ⚠️ (compute client-side?)

**Analysis:** Too many read variants. Consolidate filtering.

---

### Conversations Repository (14 methods) → WAY TOO MANY

**Commands (Write):**
- `create` - Create conversation ✓
- `addParticipants` - Add members ✓
- `removeParticipant` - Remove member ✓
- `updateParticipantRole` - Change role ✓
- `updateLastRead` - Mark read ✓
- `updateSettings` - Update settings ✓
- `updateMetadata` - Update name/description ✓
- `updateLastMessage` - Denormalize ⚠️ (event-driven?)
- `softDelete` - Mark deleted ✓
- `delete` - Hard delete ⚠️ (admin port?)

**Queries (Read):**
- `findById` - Get by ID ✓
- `findByParticipant` - List with filters ✓
- `findDirectConversation` - Find direct ⚠️ (use `find` with filter?)
- `isParticipant` - Check membership ⚠️ (compute from `findById`?)
- `getParticipantRole` - Get role ⚠️ (compute from `findById`?)

**Analysis:** Many helper getters. Should be computed at call site.

---

## Proposed Port Architecture

### Messages Ports

#### 1. `MessagesWritePort` (Commands - 4 functions)

```typescript
export type MessagesWritePort = ReturnType<typeof createMessagesWritePort>;

export const createMessagesWritePort = (deps: {
  sql: SqlClient;
  now: () => Date;
  id: () => string;
}) => {
  return {
    // Create message (includes idempotency internally)
    async create(input: NewMessage, opts: { idempotencyKey?: string }): Promise<string>,
    
    // Update status (sent → delivered → read)
    async updateStatus(id: string, status: MessageStatus, at: Date): Promise<void>,
    
    // Mark multiple as read (bulk operation)
    async markAsRead(ids: string[], at: Date, actor: Actor): Promise<void>,
    
    // Soft delete (reversible)
    async softDelete(id: string, at: Date, actor: Actor): Promise<void>
  } as const;
};
```

#### 2. `MessagesReadPort` (Queries - 4 functions)

```typescript
export type MessagesReadPort = ReturnType<typeof createMessagesReadPort>;

export const createMessagesReadPort = (deps: {
  sql: SqlClient;
}) => {
  return {
    // Get by ID
    async findById(id: string): Promise<Message | null>,
    
    // List with flexible filtering (consolidates all filter variants)
    async list(filter: MessageFilter): Promise<Message[]>,
    
    // Count messages (for pagination metadata)
    async count(filter: MessageFilter): Promise<number>,
    
    // Cursor-based pagination helper
    async listPage(filter: MessageFilter, cursor?: string, limit = 50): Promise<{
      items: Message[];
      nextCursor?: string;
    }>
  } as const;
};

// Consolidated filter type
type MessageFilter = {
  conversationId?: string;
  senderId?: string;
  status?: MessageStatus;
  type?: MessageType;
  before?: string;  // timestamp
  after?: string;   // timestamp
  includeDeleted?: boolean;
};
```

---

### Conversations Ports

#### 1. `ConversationsWritePort` (Commands - 6 functions)

```typescript
export type ConversationsWritePort = ReturnType<typeof createConversationsWritePort>;

export const createConversationsWritePort = (deps: {
  sql: SqlClient;
  now: () => Date;
  id: () => string;
}) => {
  return {
    // Create conversation
    async create(input: NewConversation, creator: Actor): Promise<string>,
    
    // Manage participants (single operation, multiple changes)
    async updateParticipants(
      id: string,
      changes: {
        add?: Array<{ userId: string; role: ParticipantRole }>;
        remove?: string[];
        updateRole?: Array<{ userId: string; role: ParticipantRole }>;
      },
      actor: Actor
    ): Promise<void>,
    
    // Mark read (per-user read receipts)
    async markRead(id: string, userId: string, at: Date): Promise<void>,
    
    // Update settings
    async updateSettings(id: string, settings: Partial<ConversationSettings>, actor: Actor): Promise<void>,
    
    // Update metadata (name, description, avatar)
    async updateMetadata(id: string, metadata: Partial<ConversationMetadata>, actor: Actor): Promise<void>,
    
    // Soft delete
    async softDelete(id: string, at: Date, actor: Actor): Promise<void>
  } as const;
};
```

#### 2. `ConversationsReadPort` (Queries - 3 functions)

```typescript
export type ConversationsReadPort = ReturnType<typeof createConversationsReadPort>;

export const createConversationsReadPort = (deps: {
  sql: SqlClient;
}) => {
  return {
    // Get by ID (includes participants, settings, metadata)
    async findById(id: string): Promise<Conversation | null>,
    
    // List with flexible filtering
    async list(filter: ConversationFilter): Promise<Conversation[]>,
    
    // Cursor-based pagination
    async listPage(filter: ConversationFilter, cursor?: string, limit = 50): Promise<{
      items: Conversation[];
      nextCursor?: string;
    }>
  } as const;
};

type ConversationFilter = {
  participantId?: string;
  type?: ConversationType;
  includeDeleted?: boolean;
};
```

#### 3. `ConversationsEventsPort` (Side-effects - 2 functions)

```typescript
// Separated: denormalization and event publishing
export const createConversationsEventsPort = (deps: {
  sql: SqlClient;
  eventBus?: EventBus;
}) => {
  return {
    // Update last message (denormalized cache)
    async updateLastMessage(id: string, messageId: string, preview: string, at: Date): Promise<void>,
    
    // Publish domain events (conversation created, participant joined, etc.)
    async publishEvent(event: ConversationEvent): Promise<void>
  } as const;
};
```

---

## Enforcement: ESLint Rules

### `.eslintrc.json` additions:

```json
{
  "rules": {
    "max-lines": ["error", { "max": 120, "skipBlankLines": true, "skipComments": true }],
    "max-lines-per-function": ["error", { "max": 40, "skipBlankLines": true, "skipComments": true }],
    "complexity": ["error", 6],
    "max-depth": ["error", 3],
    "max-params": ["error", 3]
  },
  "overrides": [
    {
      "files": ["**/ports/**/*.ts", "**/adapters/**/*.ts"],
      "rules": {
        "no-restricted-syntax": [
          "error",
          {
            "selector": "ClassDeclaration",
            "message": "Use factory functions instead of classes in ports/adapters"
          }
        ],
        "max-statements": ["error", 15]
      }
    }
  ]
}
```

---

## Test Strategy: Table-Driven

### Example: `messagesWritePort.test.ts` (~60 lines)

```typescript
import { describe, test, expect } from 'vitest';
import { createMessagesWritePort } from '../ports/messagesWritePort';
import { inMemorySql } from '../testing/fixtures/sql';

type TestCase = {
  name: string;
  setup?: () => Promise<void>;
  run: () => Promise<any>;
  assert: (result: any) => void | Promise<void>;
};

describe('MessagesWritePort', () => {
  const cases: TestCase[] = [
    {
      name: 'create → returns id',
      run: async () => sut.create(newMessage, {}),
      assert: (id) => expect(id).toMatch(/^[0-9a-f-]{36}$/)
    },
    {
      name: 'create → idempotent with same key',
      run: async () => {
        const id1 = await sut.create(newMessage, { idempotencyKey: 'key-1' });
        const id2 = await sut.create(newMessage, { idempotencyKey: 'key-1' });
        return { id1, id2 };
      },
      assert: ({ id1, id2 }) => expect(id1).toBe(id2)
    },
    {
      name: 'updateStatus → changes status',
      setup: async () => { await sut.create(newMessage, {}) },
      run: async () => {
        await sut.updateStatus(msgId, 'read', new Date());
        return sql`select status from messages where id=${msgId}`;
      },
      assert: (rows) => expect(rows[0].status).toBe('read')
    },
    {
      name: 'markAsRead → bulk operation',
      setup: seedThreeMessages,
      run: async () => {
        await sut.markAsRead([id1, id2, id3], new Date(), actor);
        return sql`select count(*) from messages where status='read'`;
      },
      assert: (rows) => expect(rows[0].count).toBe(3)
    }
  ];

  for (const c of cases) {
    test(c.name, async () => {
      if (c.setup) await c.setup();
      const result = await c.run();
      await c.assert(result);
    });
  }
});
```

---

## Property-Based Testing (Critical Paths)

### `messagesRead.property.test.ts`

```typescript
import fc from 'fast-check';

test('pagination: cursor roundtrip preserves order', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({ /* message shape */ }), { minLength: 10, maxLength: 100 }),
      fc.integer({ min: 1, max: 20 }),
      async (messages, pageSize) => {
        // Seed messages
        for (const m of messages) await write.create(m, {});
        
        // Paginate through all
        const collected = [];
        let cursor: string | undefined;
        do {
          const page = await read.listPage({}, cursor, pageSize);
          collected.push(...page.items);
          cursor = page.nextCursor;
        } while (cursor);
        
        // Verify: same count, same order
        expect(collected).toHaveLength(messages.length);
        expect(collected.map(m => m.id)).toEqual(messages.map(m => m.id));
      }
    )
  );
});
```

---

## File Structure

```
services/messaging/src/
├── ports/                              # Contract definitions
│   ├── messages/
│   │   ├── messagesWritePort.ts        (80 LOC)
│   │   ├── messagesReadPort.ts         (70 LOC)
│   │   └── types.ts                    (50 LOC - shared types)
│   └── conversations/
│       ├── conversationsWritePort.ts   (90 LOC)
│       ├── conversationsReadPort.ts    (60 LOC)
│       ├── conversationsEventsPort.ts  (40 LOC)
│       └── types.ts                    (80 LOC)
├── adapters/
│   ├── inMemory/                       # For testing
│   │   ├── messagesWriteAdapter.ts     (60 LOC)
│   │   ├── messagesReadAdapter.ts      (50 LOC)
│   │   └── ...
│   └── postgres/
│       ├── messagesWriteAdapter.ts     (100 LOC)
│       ├── messagesReadAdapter.ts      (80 LOC)
│       └── migrations/
│           └── 001_create_messages.sql
├── testing/
│   └── fixtures/
│       ├── inMemorySql.ts              (test adapter)
│       └── seedData.ts                 (reusable seeds)
└── tests/
    ├── ports/
    │   ├── messagesWrite.test.ts       (60 LOC, table-driven)
    │   ├── messagesRead.test.ts        (60 LOC)
    │   └── messagesRead.property.test.ts (40 LOC)
    └── adapters/
        └── postgres/
            ├── messagesWrite.test.ts   (integration tests)
            └── messagesRead.test.ts
```

---

## Error Taxonomy

```typescript
// Structured, not thrown strings
export type RepoError =
  | { kind: 'NotFound'; entityType: string; id: string }
  | { kind: 'Conflict'; reason: string; conflictingId?: string }
  | { kind: 'Transient'; retryable: boolean; cause?: Error };

// Helpers
export const notFound = (entityType: string, id: string): RepoError => 
  ({ kind: 'NotFound', entityType, id });

export const conflict = (reason: string, conflictingId?: string): RepoError =>
  ({ kind: 'Conflict', reason, conflictingId });

// Usage in ports
async findById(id: string): Promise<Message | RepoError> {
  const msg = await sql`select * from messages where id=${id}`;
  return msg[0] ?? notFound('Message', id);
}
```

---

## Tonight's Action Plan

### 1. Create Port Definitions (30 min)
- [ ] `ports/messages/messagesWritePort.ts`
- [ ] `ports/messages/messagesReadPort.ts`
- [ ] `ports/conversations/conversationsWritePort.ts`
- [ ] `ports/conversations/conversationsReadPort.ts`
- [ ] `ports/conversations/conversationsEventsPort.ts`
- [ ] Shared `types.ts` for each domain

### 2. Add ESLint Enforcement (15 min)
- [ ] Update `.eslintrc.json` with rules above
- [ ] Install `eslint-plugin-functional` for side-effect tracking
- [ ] Run `pnpm lint` to see current violations
- [ ] Fix or add `eslint-disable` comments with TODO

### 3. Convert One Port End-to-End (1 hour)
- [ ] Pick `messagesWritePort` (smallest, most critical)
- [ ] Implement in-memory adapter
- [ ] Write table-driven tests (60 LOC max)
- [ ] Verify all tests pass
- [ ] Document in ADR

### 4. Add Property Testing Setup (20 min)
- [ ] `pnpm add -D fast-check`
- [ ] Create `messagesRead.property.test.ts` for pagination
- [ ] Run with `--runs=100` to find edge cases

### 5. Mutation Testing Setup (15 min)
- [ ] `pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner`
- [ ] Create `stryker.conf.mjs`
- [ ] Mark critical paths (idempotency, pagination)
- [ ] Run on `messagesWritePort` tests

### 6. Update ADR (10 min)
- [ ] `docs/ADR-XXX-port-based-architecture.md`
- [ ] Explain: Why split? Why ≤6 functions? Enforcement strategy
- [ ] Migration plan for remaining ports

---

## Expected Outcomes

**Method Reduction:**
- Messages: 11 methods → 8 functions across 2 ports (27% reduction)
- Conversations: 14 methods → 11 functions across 3 ports (21% reduction)
- **PLUS:** Consolidated filters remove ~40% of query complexity

**LOC Per File:**
- Ports: 40-90 LOC (enforced by ESLint)
- Tests: 60-80 LOC (table-driven, property-based)
- Adapters: 60-100 LOC (simple, focused)

**Enforcement:**
- ESLint fails on >120 LOC, >6 complexity, classes in repo layer
- Mutation testing pressure-tests critical assertions
- Property tests catch pagination/cursor edge cases

**Maintainability:**
- Clear boundaries (Command/Query separation)
- Each port has ONE reason to change
- Tests are data tables, not narratives
- Contract-first prevents churn

---

## Migration Strategy (Expand → Migrate → Contract)

1. **Expand:** Create new ports alongside old repositories
2. **Migrate:** Update call sites one by one to use ports
3. **Contract:** Delete old repository files
4. **Enforce:** Turn on ESLint rules to prevent regression

---

## Lessons Learned

❌ **Don't:** Rewrite classes → factories and call it done  
✅ **Do:** Analyze boundaries, split by capability, enforce with tooling

❌ **Don't:** "Preserve all 25 methods"  
✅ **Do:** Cut 30-60% by consolidating and computing at call site

❌ **Don't:** Focus on LOC reduction  
✅ **Do:** Focus on API surface reduction + complexity limits

---

This is the **REAL** refactoring. Not cosmetic, but architectural.


