# Claude Code Instructions — LearnMinds SaaS

## Project Context
SaaS Multi-tenant LMS platform: **Next.js + NestJS + PostgreSQL + Prisma + JWT + Stripe + LlamaIndex**.
Workflow engine is a core feature.

---

## Rule: Skill BEFORE MCP

Always invoke the relevant **Skill first** to frame the approach, then call **MCP tools** during execution.
Never reach for an MCP before knowing what you're doing with the result.

---

## Task Classification → Tool Priority

### 1. Schema / Database Tasks
```
sequential-thinking MCP (if design is ambiguous)
  → ruflo-migrations skill (generate up/down migration pair, dry-run first)
  → codebase-memory MCP (confirm table doesn't already exist)
  → postgres MCP (read/verify only — never raw DDL)
```
> **Prisma Guardrail:** Inspect `prisma/schema.prisma` via codebase-memory BEFORE any schema change.
> All DDL must go through `prisma migrate dev`. Raw SQL DDL via MCP is strictly prohibited.
> Before creating any table: `search_code` via codebase-memory to confirm it doesn't exist.

### 2. Feature Implementation
```
brainstorming skill (if scope is unclear)
  → codebase-memory MCP (find existing patterns to reuse)
  → Context7 MCP (check library docs — Next.js / Prisma / NestJS / Stripe / LlamaIndex)
  → ponytail skill (enforce minimal implementation — always active)
  → postgres MCP (if DB read/verify needed)
```

### 3. Debugging
```
systematic-debugging skill (always — hypothesis first, then tools)
  → codebase-memory MCP (trace call path)
  → postgres MCP (inspect live data if DB-related)
  → Claude_Preview MCP (reproduce in browser if UI-related)
  → playwright MCP (E2E reproduction if needed)
```

### 4. Code Review / PR
```
code-review skill
  → security-review skill (auth, tenant resolver, RLS, JWT, Stripe webhooks)
  → ruflo-security-audit skill (dependency-check if new packages added)
  → codebase-memory MCP (cross-reference similar patterns)
```

### 5. Workflow Engine Tasks
```
sequential-thinking MCP (model the state machine before writing code)
  → codebase-memory MCP (find existing job/queue patterns)
  → ponytail skill (keep the engine minimal)
  → postgres MCP (verify workflow_runs / workflow_steps schema)
```

### 6. E2E / Integration Testing
```
verify skill (define what "working" means first)
  → Claude_Preview MCP (quick visual check)
  → playwright MCP (full E2E browser flows)
  → postgres MCP (assert DB state after test)
```

### 7. Core Business Logic (Billing / Tenant Isolation)
```
ruflo-testgen skill (TDD London School — write test first)
  → systematic-debugging skill (if test fails unexpectedly)
  → security-review skill (if touching payment or tenant boundary)
```

### 8. Research / Unknown Library
```
Context7 MCP (docs first — always, even for "known" libraries)
  → deep-research skill (only if Context7 doesn't have it)
```

### 9. LlamaIndex & RAG Tasks
```
sequential-thinking MCP (simulate token usage, retrieval chain, costs)
  → Context7 MCP (look up current LlamaIndex API docs)
  → codebase-memory MCP (check existing vector store/embedding configs)
  → ruflo-rag-memory skill (if optimizing retrieval or adding hybrid search)
```
> **RAG Safety Guardrail:** `sequential-thinking` is mandatory before any LlamaIndex change.
> Simulate end-to-end token consumption and vector retrieval routing to prevent infinite RAG loops
> and accidental API budget depletion.

### 10. Domain Modelling (new Course / Enrollment / Subscription entities)
```
ruflo-ddd skill (bounded context + aggregate root design)
  → sequential-thinking MCP (validate invariants)
  → ruflo-migrations skill (generate migration from new model)
```

### 11. Observability / Debugging Production Issues
```
ruflo-observability skill (structured logging + distributed tracing)
  → postgres MCP (correlate with DB state)
  → sequential-thinking MCP (multi-step incident reasoning)
```

---

### MCP Quick-Reference

## MCP Quick-Reference
| MCP | When to reach for it |
|-----|----------------------|
| `postgres` | Any DB read/verify — never raw DDL |
| `codebase-memory` | Before writing new code — check if it exists |
| `sequential-thinking` | Ambiguous design, complex state, multi-step reasoning |
| `memory` | Store arch decisions that must survive across sessions |
| `Context7` | Any question about a library's current API |
| `playwright` | Full E2E browser automation |
| `Claude_Preview` | Quick inline browser preview / visual check |
| `scheduled-tasks` | Recurring cloud agents (billing reconciliation, tenant health) |

---

## Skill Quick-Reference
| Skill | Trigger condition |
|-------|------------------|
| `ponytail` | **Always active (full mode).** Enforces YAGNI on every implementation. |
| `brainstorming` | Any new feature before implementation starts |
| `systematic-debugging` | Any bug — defines hypothesis before touching code |
| `security-review` | Auth, tenant resolver, RLS, JWT, Stripe webhook, any trust boundary |
| `ruflo-security-audit` | New npm packages added; dependency CVE check |
| `planning-with-files` | Tasks spanning >3 files or >1 session |
| `ruflo-migrations` | Any Prisma schema change — generates up/down pair with dry-run |
| `ruflo-testgen` | Core business logic: billing, tenant isolation, workflow engine |
| `ruflo-rag-memory` | LlamaIndex retrieval optimization, hybrid search |
| `ruflo-ddd` | Designing new domain entities / bounded contexts |
| `ruflo-observability` | Adding structured logging, tracing, or debugging production |
| `verify` | After any non-trivial change — confirm it works in the running app |
| `commit` / `commit-push-pr` | End of each logical unit of work |

---

## Hard Rules
1. **No raw SQL DDL** via MCP. All schema changes through `prisma migrate dev`.
2. **No new npm package** without `ruflo-security-audit:dependency-check` first.
3. **No LlamaIndex change** without `sequential-thinking` simulation first.
4. **No auth/tenant/payment code** without `security-review` sign-off.
5. **Ponytail is always on.** Shortest working diff wins. YAGNI, always.