# Claude Code Instructions — my-saas-app

## Project Context
SaaS Multi-tenant platform (Next.js + NestJS + PostgreSQL + Prisma + JWT + Stripe + LlamaIndex).
Workflow engine is a core feature.

---

## MCP & Skill Execution Order

### Rule: Skill BEFORE MCP
Always invoke the relevant **Skill first** to frame the approach,
then call **MCP tools** during execution. Never reach for an MCP
before knowing what you're doing with the result.

---

### Task Classification → Tool Priority

#### 1. Schema / Database Tasks
```
sequential-thinking (if design is ambiguous)
  → postgres MCP (execute DDL, query, verify)
  → codebase-memory MCP (check existing models before adding new ones)
```
> Before creating any table: `search_code` via codebase-memory to confirm it doesn't exist.

#### 2. Feature Implementation
```
brainstorming skill (if scope is unclear)
  → codebase-memory MCP (find existing patterns to reuse)
  → Context7 MCP (check library docs if touching Next.js / Prisma / Auth)
  → ponytail skill (enforce minimal implementation)
  → postgres MCP (if DB changes needed)
```

#### 3. Debugging
```
systematic-debugging skill (always — defines the hypothesis first)
  → codebase-memory MCP (trace call path)
  → postgres MCP (inspect live data if DB-related)
  → playwright MCP (reproduce in browser if UI-related)
```

#### 4. Code Review / PR
```
code-review skill
  → security-review skill (if touching auth, tenant resolution, RLS, payments)
  → codebase-memory MCP (cross-reference similar patterns)
```

#### 5. Workflow Engine Tasks
```
sequential-thinking MCP (model the state machine before writing code)
  → codebase-memory MCP (find existing job/queue patterns)
  → ponytail skill (keep the engine minimal)
  → postgres MCP (verify workflow_runs / workflow_steps schema)
```

#### 6. E2E / Integration Testing
```
verify skill (defines what "working" means)
  → playwright MCP (execute browser flows)
  → postgres MCP (assert DB state after test)
```

#### 7. Research / Unknown Library
```
Context7 MCP (docs first — always, even for "known" libraries)
  → deep-research skill (only if Context7 doesn't have it)
```

---

### MCP Quick-Reference

| MCP | When to reach for it |
|-----|----------------------|
| `postgres` | Any DB read/write/schema change |
| `codebase-memory` | Before writing new code — check if it exists |
| `sequential-thinking` | Ambiguous design, complex state, multi-step reasoning |
| `memory` | Store arch decisions that must survive across sessions |
| `Context7` | Any question about a library's current API |
| `playwright` | Browser automation, E2E, screenshot verification |

---

### Skill Quick-Reference

| Skill | Trigger condition |
|-------|------------------|
| `ponytail` | Always active (full mode). Enforces YAGNI on every implementation. |
| `brainstorming` | Any new feature before implementation starts |
| `systematic-debugging` | Any bug — defines hypothesis before touching code |
| `security-review` | Auth, tenant resolver, RLS policies, payment flows |
| `planning-with-files` | Tasks spanning >3 files or >1 session |
| `test-driven-development` | Workflow engine core logic, billing, tenant isolation |
| `verify` | After any non-trivial change — confirm it works in the running app |
| `commit` / `commit-push-pr` | End of each logical unit of work |

