# Claude Code Instructions — LearnMinds SaaS

## Project Context
SaaS Multi-tenant LMS platform: **Next.js (apps/web) + NestJS (apps/api) + PostgreSQL + Prisma + JWT**.
Monorepo: **pnpm workspaces + Turborepo**. `packages/ai-core` and `packages/shared-types` exist but are empty stubs.

### Current vs Planned (check before invoking any Task Classification below)

| Feature | Status |
|---|---|
| Auth (register/login, JWT, RBAC, tenant/department admin) | ✅ Built — `apps/api/src/auth`, `apps/api/src/departments` |
| Tenant isolation | ⚠️ Partial — `User.tenantId` is **nullable**, no global tenant-scoping guard. Only `AdminFeatureGuard` checks tenant on specific routes. |
| Workflow engine | ❌ Not started — no `WorkflowRun` model, no code anywhere, despite being a target feature |
| Stripe / Billing | ❌ Not started — UI placeholder only (`apps/web/.../admin/billing`), no backend, no webhook handlers |
| LlamaIndex / RAG | ❌ Not started — `packages/ai-core` is an empty TS stub, no dependency installed |
| Tests | ❌ None — Jest is configured in `apps/api` but zero `.spec.ts` files exist anywhere, including for the shipped Auth module |
| CI | ❌ None — no `.github/workflows` or any pipeline config |

Do not assume Stripe/LlamaIndex/Workflow code exists when answering — those sections below are **forward guardrails for when that code is written**, not descriptions of current behavior.

---

## Tool Usage Disclosure (Hard Rule)

Before or after any action, output exactly one line listing every Skill / MCP / Plugin actually invoked — name only, no explanation of what it did or why.

Format: `Used: skill:X, mcp:Y, plugin:Z`

If nothing was invoked (pure conversation, no tool calls), omit the line entirely.

---

## Tool Ecosystem Reference

This section is the result of a full audit (2026-07-03) — don't redo this analysis, just update it when the stack changes.

### Active MCPs

| MCP | When to reach for it |
|-----|----------------------|
| `postgres` | Any DB read/verify — never raw DDL. Connected via local scope (`.claude.json`, not committed). |
| `Context7` | Any question about a library's current API |
| `playwright` | Full E2E browser automation |
| `Claude_Preview` | Quick inline browser preview / visual check |
| `scheduled-tasks` | Recurring cloud agents (billing reconciliation, tenant health — once billing exists) |

**Not installed, don't reference:** `codebase-memory`, `sequential-thinking`, `memory` (generic MCP). Their jobs are covered natively:
- code lookup → Grep/Glob/Explore agent
- multi-step design reasoning → direct reasoning or `EnterPlanMode`
- cross-session persistence → the built-in file-based auto-memory system (already active, different name)

### Active Skills

| Skill | Trigger condition |
|-------|------------------|
| `ponytail` | **Always active (full mode).** Enforces YAGNI on every implementation. |
| `brainstorming` | Any new feature before implementation starts |
| `systematic-debugging` | Any bug — defines hypothesis before touching code |
| `security-review` | Auth, tenant resolver, RLS, JWT, Stripe webhook, any trust boundary |
| `ruflo-security-audit` | New npm packages added; dependency CVE check |
| `planning-with-files` | Tasks spanning >3 files or >1 session |
| `ruflo-migrations` | Any Prisma schema change — generates up/down pair with dry-run |
| `ruflo-testgen` | Core business logic: billing, tenant isolation, workflow engine; also any existing untested module being touched |
| `ruflo-rag-memory` | LlamaIndex retrieval optimization, hybrid search (once started) |
| `ruflo-ddd` | Designing new domain entities / bounded contexts |
| `ruflo-observability` | Adding structured logging, tracing, or debugging production |
| `ruflo-adr` | Recording an architecture decision (mirrors the existing `task_plan.md`/`findings.md` pattern) |
| `ruflo-docs` | Generating/maintaining project documentation |
| `ruflo-cost-tracker` | Tracking AI/LLM token spend — pairs with the LlamaIndex budget guardrail below |
| `code-review` / `simplify` / `verify` | Quality gates — after any non-trivial change |
| `find-skills` | Discovering a new skill from the skills.sh ecosystem when a real gap shows up |
| `stripe-best-practices` | Any Stripe integration work (webhook signing, idempotency) — installed from `stripe/ai` |
| `nestjs-best-practices` | NestJS module/guard/interceptor/DI patterns — installed from `kadajett/agent-nestjs-skills` |
| `prisma-client-api` | Prisma Client query design/optimization — installed from `prisma/skills` |
| `nextjs` (vercel-plugin) | Next.js App Router patterns — installed from `vercel-labs/vercel-plugin` |
| `commit` / `commit-push-pr` | End of each logical unit of work |

### Disabled Plugins (scope: user — affects all projects, not just this one)

The following `ruflo-*` plugins were audited and disabled as irrelevant to a SaaS LMS (quant trading, IoT, federation, local LLM fine-tuning, vector-DB internals redundant with LlamaIndex, GAIA benchmarking, etc.). Re-enable individually with `claude plugin enable <name>@ruflo` only if a real need appears — don't re-enable speculatively:

`ruflo-neural-trader`, `ruflo-iot-cognitum`, `ruflo-market-data`, `ruflo-federation`, `ruflo-metaharness`, `ruflo-arena`, `ruflo-sparc`, `ruflo-swarm`, `ruflo-agentdb`, `ruflo-ruvector`, `ruflo-ruvllm`, `ruflo-knowledge-graph`, `ruflo-graph-intelligence`, `ruflo-daa`, `ruflo-goals`, `ruflo-intelligence`, `ruflo-loop-workers`, `ruflo-plugin-creator`, `ruflo-rvf`, `ruflo-aidefence`, `ruflo-jujutsu`, `ruflo-autopilot`, `ruflo-browser`, `ruflo-agent`, `ruflo-workflows`.

`ruflo-core` stays enabled — shared runtime dependency for the kept ruflo plugins.

### Considered but not installed

- Any LlamaIndex-specific skill from skills.sh — best option had only 485 installs, below the 1K quality bar, and the feature hasn't started. Use `Context7` for live docs when RAG work actually begins; revisit skills.sh then.
- Dedicated JWT skill — search results were low-quality or off-stack (Spring Boot/Java). NestJS's own Passport patterns + `security-review` already cover this.

---

## Rule: Skill BEFORE MCP

Always invoke the relevant **Skill first** to frame the approach, then call **MCP tools** during execution.
Never reach for an MCP before knowing what you're doing with the result.

---

## Task Classification → Tool Priority

### 1. Schema / Database Tasks
```
ruflo-migrations skill (generate up/down migration pair, dry-run first)
  → Grep/Glob (confirm table doesn't already exist in schema.prisma)
  → postgres MCP (read/verify only — never raw DDL)
```
> **Prisma Guardrail:** Inspect `apps/api/prisma/schema.prisma` directly BEFORE any schema change.
> All DDL must go through `prisma migrate dev` (run from `apps/api/`). Raw SQL DDL via MCP is strictly prohibited.
> Before creating any table: grep the schema to confirm it doesn't exist.

### 2. Feature Implementation
```
brainstorming skill (if scope is unclear)
  → Grep/Glob/Explore agent (find existing patterns to reuse)
  → Context7 MCP (check library docs — Next.js / Prisma / NestJS)
  → nestjs-best-practices / nextjs / prisma-client-api skill (whichever layer is being touched)
  → ponytail skill (enforce minimal implementation — always active)
  → postgres MCP (if DB read/verify needed)
```

### 3. Debugging
```
systematic-debugging skill (always — hypothesis first, then tools)
  → Grep/Glob (trace call path)
  → postgres MCP (inspect live data if DB-related)
  → Claude_Preview MCP (reproduce in browser if UI-related)
  → playwright MCP (E2E reproduction if needed)
```

### 4. Code Review / PR
```
code-review skill
  → security-review skill (auth, tenant resolver, RLS, JWT — highest-risk area given nullable tenantId)
  → ruflo-security-audit skill (dependency-check if new packages added)
  → Grep (cross-reference similar patterns)
```

### 5. Workflow Engine Tasks (not yet started — see status table)
```
Design the state machine explicitly before writing code (list states + valid transitions)
  → Grep (find existing job/queue patterns, likely none yet)
  → ponytail skill (keep the engine minimal)
  → ruflo-migrations skill (create workflow_runs / workflow_steps schema when ready)
```

### 6. E2E / Integration Testing
```
verify skill (define what "working" means first)
  → Claude_Preview MCP (quick visual check)
  → playwright MCP (full E2E browser flows)
  → postgres MCP (assert DB state after test)
```
> **Testing debt:** No test files exist yet anywhere in the repo. When touching Auth, Departments, or any existing module, proactively suggest adding a `.spec.ts` via `ruflo-testgen` even if not explicitly asked — this is a known gap, not a hypothetical one.

### 7. Core Business Logic (Billing / Tenant Isolation)
```
ruflo-testgen skill (TDD London School — write test first)
  → stripe-best-practices skill (once Stripe work starts)
  → systematic-debugging skill (if test fails unexpectedly)
  → security-review skill (if touching payment or tenant boundary)
```

### 8. Research / Unknown Library
```
Context7 MCP (docs first — always, even for "known" libraries)
  → find-skills skill (check skills.sh for a dedicated skill if the gap is recurring)
  → deep-research skill (only if Context7 doesn't have it)
```

### 9. LlamaIndex & RAG Tasks (not yet started — see status table)
```
Reason through token usage, retrieval chain, and cost estimate before writing code
  → Context7 MCP (look up current LlamaIndex API docs)
  → Grep (check existing vector store/embedding configs — likely none yet)
  → ruflo-rag-memory skill (if optimizing retrieval or adding hybrid search)
  → ruflo-cost-tracker skill (track actual spend once live)
```
> **RAG Safety Guardrail:** Before any LlamaIndex change, explicitly reason through end-to-end token consumption and vector retrieval routing to prevent infinite RAG loops and accidental API budget depletion.

### 10. Domain Modelling (new Course / Enrollment / Subscription entities)
```
ruflo-ddd skill (bounded context + aggregate root design)
  → validate invariants explicitly before coding
  → ruflo-migrations skill (generate migration from new model)
  → ruflo-adr skill (record the decision if it's architecturally significant)
```

### 11. Observability / Debugging Production Issues
```
ruflo-observability skill (structured logging + distributed tracing)
  → postgres MCP (correlate with DB state)
  → reason through the incident step by step before acting
```

---

## Tenant Isolation (Hard Rule)

- Every Prisma query touching tenant-scoped models (`User`, `Department`, future `Course`/`Enrollment`) **must** filter by `tenantId`.
- `tenantId` on `User` is currently nullable in schema — treat any code path that allows a `null` tenantId outside of `SUPER_ADMIN` role as a bug, not a valid state.
- Prefer injecting `tenantId` via a NestJS request-scoped provider (AsyncLocalStorage or `REQUEST`) over passing it manually through every service method signature.
- No repository/service method may build a Prisma `where` clause without `tenantId` unless explicitly reviewed under `security-review`.

## Workflow Engine State Machine (applies once `WorkflowRun` model exists)

- All `workflow_runs.status` transitions (`PENDING → RUNNING → COMPLETED/FAILED`) must go through a single state-machine validation function — never a direct `prisma.workflowRun.update({ data: { status } })` from arbitrary call sites.
- Invalid transitions (e.g. `COMPLETED → RUNNING`) must throw, not silently overwrite.

## Coding Standards

- **Naming:** variables = nouns (`userList`), functions = verb-noun (`fetchUser`), booleans = `is/has/can` prefix
- **Validation:** all external input (API endpoints, env vars) must use **Zod** or `class-validator` DTOs — no ad-hoc `if` checks
- **API responses:** consistent shape across NestJS controllers — never naked objects mixed with raw throws
- **File naming:** kebab-case files, PascalCase components, camelCase utils

## Common Commands

- **Backend dev:** `pnpm --filter api dev` (or `turbo dev --filter=api`)
- **Frontend dev:** `pnpm --filter web dev` (or `turbo dev --filter=web`)
- **Database:** `pnpm --filter api exec prisma studio` / `pnpm --filter api exec prisma migrate dev`
- **Backend tests:** `pnpm --filter api test` / `pnpm --filter api test:e2e`
- **Lint:** `pnpm --filter api lint` / `pnpm --filter web lint`

---

## Hard Rules

1. **No raw SQL DDL** via MCP. All schema changes through `prisma migrate dev`.
2. **No new npm package** without `ruflo-security-audit:dependency-check` first.
3. **No LlamaIndex change** without explicitly reasoning through token/cost simulation first.
4. **No auth/tenant/payment code** without `security-review` sign-off.
5. **Ponytail is always on.** Shortest working diff wins. YAGNI, always.
6. **No claiming a feature works** (Stripe, LlamaIndex, Workflow engine) without checking the Current vs Planned table first.
7. **Disclose tool usage** — one line per action, per the Tool Usage Disclosure rule above.
