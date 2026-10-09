# Claude Code Instructions — LearnMinds SaaS

## Language (Hard Rule)

Always respond to the user in **Chinese (中文)** — regardless of the language of the user's message, code, file contents, or any other context. Code, commands, file paths, and error messages stay in their original form; only the surrounding explanation/prose must be Chinese.

## Terse Output Style (Hard Rule)

Use the `caveman` skill at `lite` level for **reply prose only** — explanations, status updates, results, summaries. Drop filler, pleasantries and hedging; fragments are fine; keep technical terms exact. The Language rule still wins: compress the *Chinese*, don't switch to English caveman-speak.

- **Never apply it to:** code, code comments, commit messages, PR descriptions, files written to disk (docs, specs, plans, CLAUDE.md), error messages, shell commands, or the `Used:` disclosure line. Those keep normal full wording.
- Do not use `caveman-commit`, `caveman-review` or `caveman-compress` (the last one overwrites files).
- Destructive/irreversible-action warnings and anything the user must decide on: write in full, clear sentences — not compressed.

## Project Context
SaaS Multi-tenant LMS platform: **Next.js (apps/web) + NestJS (apps/api) + PostgreSQL + Prisma + JWT**.
Monorepo: **pnpm workspaces + Turborepo**. `packages/ai-core` and `packages/shared-types` exist but are empty stubs.

### Current vs Planned (check before invoking any Task Classification below)

| Feature | Status |
|---|---|
| Auth (register/login, JWT, RBAC, tenant/department admin) | ✅ Built — `apps/api/src/auth`, `apps/api/src/departments` |
| AI Agent Chat (multi-agent, RAG, file/image attachments) | ✅ Built — `apps/api/src/agent-chat`, `apps/api/src/openai`. Models: `AiAgent`, `AiAgentModel`, `KnowledgeBase(File)`, `AgentConversation`, `AgentMessage`, `AgentAttachment` |
| RAG | ✅ Built — but via **OpenAI native Vector Store + `file_search`** (`openai.service.ts`), not LlamaIndex. `packages/ai-core` is still an empty stub and unused. |
| Tenant isolation | ⚠️ Partial — `User.tenantId` is **nullable with no global tenant-scoping guard** (real gap). `AiAgent.tenantId` is also nullable but **by design** — `null` = platform-wide shared agent, not a bug. Only `AdminFeatureGuard` checks tenant on specific routes. |
| Workflow engine | ❌ Not started — no `WorkflowRun` model, no code anywhere, despite being a target feature |
| Stripe / Billing | ❌ Not started — UI placeholder only (`apps/web/.../admin/billing`), no backend, no webhook handlers |
| Tests | ⚠️ Partial — Jest configured in `apps/api`; 17 `.spec.ts` files exist (verified 2026-10-09) but coverage is incomplete. Check the specific module before claiming it is tested. |
| CI | ❌ None — no `.github/workflows` or any pipeline config |

Do not assume Stripe/Workflow code exists, and do not assume RAG means LlamaIndex — those sections below are **forward guardrails for when that code is written**, not descriptions of current behavior.

---

## Tool Usage Disclosure (Hard Rule)

Before or after any action, output exactly one line listing every Skill / MCP / Plugin actually invoked — name only, no explanation of what it did or why.

Format: `Used: skill:X, mcp:Y, plugin:Z`

If nothing was invoked (pure conversation, no tool calls), omit the line entirely.

---

## Superpowers Workflow (Hard Rule)

Invoke the matching `superpowers:*` skill **before** acting — before clarifying questions, before reading code. If there is even a 1% chance one applies, invoke it. Process skills come first, then implementation skills (`nestjs-best-practices`, `prisma-client-api`, `nextjs`).

| Situation | Must invoke |
|---|---|
| New feature / behavior change / new component | `superpowers:brainstorming` → `superpowers:writing-plans` (if multi-step) |
| Executing a written plan | `superpowers:executing-plans` (or `superpowers:subagent-driven-development` when tasks are independent) |
| Any feature or bugfix, before writing implementation code | `superpowers:test-driven-development` |
| Any bug / failing test / unexpected behavior | `superpowers:systematic-debugging` |
| 2+ independent tasks | `superpowers:dispatching-parallel-agents` |
| About to claim done / fixed / passing, or to commit / open a PR | `superpowers:verification-before-completion` — run the command, show the output |
| Finished a major task or feature | `superpowers:requesting-code-review` — **in addition to** `code-review`, which runs after every change |
| Received review feedback | `superpowers:receiving-code-review` |
| Creating or editing a Skill | `superpowers:writing-skills` |
| User asks why a superpowers session went wrong | `superpowers:diagnosing-superpowers` |

- **Never invoke `superpowers:using-git-worktrees` or `superpowers:finishing-a-development-branch`** (user decision 2026-10-09: work happens in the main checkout; merge / PR / cleanup are done manually). If another superpowers skill (e.g. `executing-plans`, `subagent-driven-development`, `writing-plans`) lists either as a required sub-skill, skip that step. When implementation is done, finish with verification → `code-review` → `ponytail:ponytail-debt`, then hand back.
- Precedence: CLAUDE.md Hard Rules > superpowers > default behavior. `ponytail` decides *how much code* to write; superpowers decides *process*.
- Specs and plans go to `docs/superpowers/specs/` and `docs/superpowers/plans/` (existing convention). These are also where architecture decisions are recorded — no separate ADR tool.
- Where a superpowers skill overlaps another row below (brainstorming, debugging, TDD, verification), invoke the superpowers one.
- **Git:** the user commits, pushes and pulls manually. Never run `git commit` / `git push` / `git pull` or open a PR unless explicitly asked in that message. Read-only git (`status`, `diff`, `log`) is fine. (`commit-commands` plugin was uninstalled 2026-10-09 for this reason.)

---

## Tool Ecosystem Reference

This section is the result of a full audit (2026-07-03, updated 2026-10-09) — don't redo this analysis, just update it when the stack changes.

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
| `superpowers:*` | **Mandatory** — see the Superpowers Workflow section above. |
| `caveman` | **Mandatory for reply prose** (lite) — see Terse Output Style above. Never in code/commits/files. |
| `planning-with-files` | **Mandatory** for any task spanning >3 files, >1 session, or 5+ tool calls. Use `/plan-zh` (`planning-with-files-zh`) or `/plan` (`planning-with-files`) — the other language variants are switched off via `skillOverrides`. It complements superpowers, not replaces it: superpowers specs/plans (`docs/superpowers/`) say *what to build*; `task_plan.md` / `progress.md` / `findings.md` track *execution state and session recovery*. The root-level files are from the finished 2026-06-30 Auth task — overwrite them when starting a new task, don't append. |
| `nestjs-best-practices` | **Mandatory** before writing or changing any `apps/api` NestJS code (module / controller / service / guard / interceptor / DI / exception filter). Installed from `kadajett/agent-nestjs-skills` |
| `prisma-client-api` | **Mandatory** before writing or changing any Prisma Client query, transaction, or `schema.prisma` model. Installed from `prisma/skills` |
| `frontend-design` | **Recommended** (not mandatory) when building new UI or visually reshaping a page/component in `apps/web` (layout, typography, color, spacing). Skip for logic-only or small tweaks. |
| `vercel-react-best-practices` | **Recommended** (not mandatory) for `apps/web` work on data fetching, Server/Client component boundaries, rendering strategy, bundle size/imports, or performance. Complements `nextjs` (routing/RSC conventions). Installed from `vercel-labs/agent-skills` (2026-10-09). |
| `playwright-best-practices` | **Mandatory** before writing, fixing or debugging any Playwright test (E2E, flaky tests, CI config, auth/fixtures) — before using the `playwright` MCP to author tests. Installed from `currents-dev/playwright-best-practices-skill` (2026-10-09). |
| `ponytail:ponytail-debt` | **Mandatory** when a feature's implementation is done and verified (after `code-review`, before handing back for the user's manual commit) — harvests `ponytail:` shortcut comments into a ledger so deferrals don't rot. Read-only, cheap. |
| `ponytail:ponytail-audit` | **Mandatory** before each release / deploy — repo-wide over-engineering scan (what to delete / replace with stdlib). Read-only report; apply nothing without asking. |
| `security-review` | Auth, tenant resolver, RLS, JWT, Stripe webhook, any trust boundary |
| `code-review` | **Mandatory after every code change.** After a major feature is complete, also run `superpowers:requesting-code-review`. |
| `simplify` | Quality gate — after any non-trivial change (verification is `superpowers:verification-before-completion`) |
| `find-skills` | Discovering a new skill from the skills.sh ecosystem when a real gap shows up |
| `stripe-best-practices` | Any Stripe integration work (webhook signing, idempotency) — installed from `stripe/ai` |
| `nextjs` (vercel-plugin) | Next.js App Router patterns — installed from `vercel-labs/vercel-plugin` |

### Removed / Disabled Plugins (scope: user — affects all projects, not just this one)

**Uninstalled 2026-10-09:** `ruflo-core`, `ruflo-cost-tracker`, `ruflo-observability`, `ruflo-rag-memory`, `ruflo-docs`, `ruflo-migrations`, `ruflo-adr`, `ruflo-testgen`, `ruflo-ddd`, `commit-commands`.
- `ruflo-migrations` generated raw `NNN_name.up.sql` / `.down.sql` files — incompatible with Prisma (timestamped `migration.sql`, no down migrations) and with Hard Rule 1.
- `ruflo-docs`, `ruflo-cost-tracker` etc. were thin wrappers over `npx @claude-flow/cli` and tracked Claude spend, not the app's OpenAI spend.
- `ruflo-core` provided the `claude-flow` MCP server and POSIX-only hooks; the other ruflo plugins' `mcp__claude-flow__*` calls no longer work.

- `ruflo-adr` / `ruflo-testgen` / `ruflo-ddd` depended on the removed MCP server. Replacements: decisions → `docs/superpowers/specs/`; tests → `superpowers:test-driven-development` + Jest `--coverage`; domain modelling → `superpowers:brainstorming` + `prisma-client-api` (the repo uses NestJS modules + Prisma, not a `domain/entities/repositories` layering).
- `commit-commands`: the user commits and pushes manually (see Git rule).
- `grill-me` removed 2026-10-09 (empty stub pointing at a non-existent `/grilling` skill, model-invocation disabled; `superpowers:brainstorming` already interrogates the design). `verify` / `deep-research` are not installed — don't reference them (use `superpowers:verification-before-completion`; Context7 + WebSearch).

**Still installed but intentionally not used:** `ruflo-security-audit` — `dependency-check` shells out to `npx @claude-flow/cli@latest` (downloads an unaudited package at runtime) and uses `npm audit`, but this repo uses pnpm. Use `pnpm audit` instead (Hard Rule 2). Also hidden via `skillOverrides`: non-zh/en `planning-with-files` variants, `ponytail-gain`, `ponytail-help`. `hookify` is kept (user decision, not mandatory).

**Disabled earlier** as irrelevant to a SaaS LMS (quant trading, IoT, federation, local LLM fine-tuning, vector-DB internals redundant with LlamaIndex, GAIA benchmarking, etc.). Re-enable individually with `claude plugin enable <name>@ruflo` only if a real need appears — don't re-enable speculatively:

`ruflo-neural-trader`, `ruflo-iot-cognitum`, `ruflo-market-data`, `ruflo-federation`, `ruflo-metaharness`, `ruflo-arena`, `ruflo-sparc`, `ruflo-swarm`, `ruflo-agentdb`, `ruflo-ruvector`, `ruflo-ruvllm`, `ruflo-knowledge-graph`, `ruflo-graph-intelligence`, `ruflo-daa`, `ruflo-goals`, `ruflo-intelligence`, `ruflo-loop-workers`, `ruflo-plugin-creator`, `ruflo-rvf`, `ruflo-aidefence`, `ruflo-jujutsu`, `ruflo-autopilot`, `ruflo-browser`, `ruflo-agent`, `ruflo-workflows`.

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
prisma-client-api skill (model / query design)
  → Grep/Glob (confirm table doesn't already exist in schema.prisma)
  → edit schema.prisma → `prisma migrate dev --create-only` (review the generated SQL) → `prisma migrate dev`
  → postgres MCP (read/verify only — never raw DDL)
```
> **Prisma Guardrail:** Inspect `apps/api/prisma/schema.prisma` directly BEFORE any schema change.
> All DDL must go through `prisma migrate dev` (run from `apps/api/`). Raw SQL DDL via MCP is strictly prohibited.
> Before creating any table: grep the schema to confirm it doesn't exist.
> Prisma has no down migrations — a rollback is a new forward migration.

### 2. Feature Implementation
```
superpowers:brainstorming skill (every new feature / behavior change)
  → Grep/Glob/Explore agent (find existing patterns to reuse)
  → Context7 MCP (check library docs — Next.js / Prisma / NestJS)
  → nestjs-best-practices (mandatory for apps/api) / prisma-client-api (mandatory for any Prisma query) / nextjs (apps/web); frontend-design and vercel-react-best-practices are recommended, not mandatory
  → superpowers:test-driven-development (test first)
  → ponytail skill (enforce minimal implementation — always active)
  → postgres MCP (if DB read/verify needed)
```

### 3. Debugging
```
superpowers:systematic-debugging skill (always — hypothesis first, then tools)
  → Grep/Glob (trace call path)
  → postgres MCP (inspect live data if DB-related)
  → Claude_Preview MCP (reproduce in browser if UI-related)
  → playwright MCP (E2E reproduction if needed)
```

### 4. Code Review / PR
```
code-review skill (every change) + superpowers:requesting-code-review (major feature complete)
  → security-review skill (auth, tenant resolver, RLS, JWT — highest-risk area given nullable tenantId)
  → `pnpm audit` (if new packages added)
  → Grep (cross-reference similar patterns)
```

### 5. Workflow Engine Tasks (not yet started — see status table)
```
Design the state machine explicitly before writing code (list states + valid transitions)
  → Grep (find existing job/queue patterns, likely none yet)
  → ponytail skill (keep the engine minimal)
  → prisma-client-api skill + `prisma migrate dev` (create workflow_runs / workflow_steps schema when ready)
```

### 6. E2E / Integration Testing
```
superpowers:verification-before-completion skill (define what "working" means first)
  → playwright-best-practices skill (mandatory before writing/fixing any Playwright test)
  → Claude_Preview MCP (quick visual check)
  → playwright MCP (full E2E browser flows)
  → postgres MCP (assert DB state after test)
```
> **Testing debt:** coverage is incomplete (see status table). When touching Auth, Departments, or any existing module without a `.spec.ts`, proactively suggest adding one via `superpowers:test-driven-development` even if not explicitly asked. Use `pnpm --filter api test -- --coverage` to find gaps.

### 7. Core Business Logic (Billing / Tenant Isolation)
```
superpowers:test-driven-development skill (write test first; mock external dependencies at boundaries)
  → stripe-best-practices skill (once Stripe work starts)
  → superpowers:systematic-debugging skill (if test fails unexpectedly)
  → security-review skill (if touching payment or tenant boundary)
```

### 8. Research / Unknown Library
```
Context7 MCP (docs first — always, even for "known" libraries)
  → find-skills skill (check skills.sh for a dedicated skill if the gap is recurring)
  → WebSearch / WebFetch directly (only if Context7 doesn't have it; no multi-agent research report needed)
```

### 9. RAG / Agent Chat Tasks (built — via OpenAI native Vector Store, not LlamaIndex)
```
Reason through token usage, retrieval chain, and cost estimate before writing code
  → Grep `apps/api/src/openai/openai.service.ts` and `apps/api/src/agent-chat/agent-chat.service.ts` first — reuse the existing vector-store/file_search pattern, don't reinvent it
  → Context7 MCP (OpenAI API docs — Responses API, vector stores, file_search — this is NOT LlamaIndex)
  → check real spend via the OpenAI usage dashboard / the `usage` field in API responses (no in-repo cost tracker exists)
```
> **RAG Safety Guardrail:** Before any change to vector-store/file_search logic, explicitly reason through end-to-end token consumption and retrieval routing to prevent infinite RAG loops and accidental API budget depletion. This applies now — it's live, not a future guardrail.
> **If LlamaIndex work is proposed instead:** confirm first whether it's meant to replace or sit alongside the existing OpenAI-native RAG — don't assume `packages/ai-core` is the intended home without asking, since a working alternative already exists.

### 10. Domain Modelling (new Course / Enrollment / Subscription entities)
```
superpowers:brainstorming skill (entities, relations, ownership, which module owns what)
  → validate invariants explicitly before coding
  → prisma-client-api skill + `prisma migrate dev` (generate migration from new model)
  → record the decision in the `docs/superpowers/specs/` design doc if it's architecturally significant
```

### 11. Observability / Debugging Production Issues
```
nestjs-best-practices skill (Logger / interceptor patterns — structured logs with tenantId + request id)
  → postgres MCP (correlate with DB state)
  → reason through the incident step by step before acting (superpowers:systematic-debugging)
```

### 12. AI Agent Chat (conversations, messages, attachments)
```
Grep `agent-chat.service.ts` for the existing pattern before adding a new endpoint/field
  → nestjs-best-practices skill (mandatory)
  → superpowers:test-driven-development skill (extend the existing agent-chat specs)
  → security-review skill (attachment downloads must stay ownership-checked, never a bare static path)
```
> **Established patterns to reuse, not reinvent:**
> - Authenticated file download: check ownership through the owning relation (e.g. `message: { conversation: { userId } }`), never serve a bare static file path — mirrors `CourseFilesService.getDownloadable`.
> - On a failed OpenAI call: roll back the just-created DB row and delete any OpenAI-side resources (files, vector stores) created this turn — never leave an orphaned turn or leaked OpenAI resource.
> - Multer file uploads: clean up local disk files in every failure branch (`cleanupLocalFiles`), not just the happy path.

---

## Tenant Isolation (Hard Rule)

- Every Prisma query touching tenant-scoped models (`User`, `Department`, future `Course`/`Enrollment`) **must** filter by `tenantId`.
- `tenantId` on `User` is currently nullable in schema — treat any code path that allows a `null` tenantId outside of `SUPER_ADMIN` role as a bug, not a valid state.
- **Exception:** `AiAgent.tenantId = null` is intentional — it marks a platform-wide agent visible to every tenant (see `findPublishedAgents`). Do not "fix" this by making it required; a tenant-scoped agent is a separate, valid, non-null case.
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
- **Authenticated file downloads:** always check ownership through the owning relation in the query itself, never serve a bare static file path (see `AgentChatService.getAttachmentDownload` / `CourseFilesService.getDownloadable`)

## Common Commands

- **Backend dev:** `pnpm --filter api dev` (or `turbo dev --filter=api`)
- **Frontend dev:** `pnpm --filter web dev` (or `turbo dev --filter=web`)
- **Database:** `pnpm --filter api exec prisma studio` / `pnpm --filter api exec prisma migrate dev`
- **Backend tests:** `pnpm --filter api test` / `pnpm --filter api test:e2e`
- **Lint:** `pnpm --filter api lint` / `pnpm --filter web lint`

---

## Hard Rules

1. **No raw SQL DDL** via MCP. All schema changes through `prisma migrate dev`.
2. **No new npm package** without vetting it first (maintainers, downloads, install scripts) and running `pnpm audit` after install.
3. **No LlamaIndex change** without explicitly reasoning through token/cost simulation first.
4. **No auth/tenant/payment code** without `security-review` sign-off.
5. **Ponytail is always on.** Shortest working diff wins. YAGNI, always.
6. **No claiming a feature works** (Stripe, LlamaIndex, Workflow engine) without checking the Current vs Planned table first.
7. **Disclose tool usage** — one line per action, per the Tool Usage Disclosure rule above.
8. **Always respond in Chinese** — regardless of input language; code/commands/paths stay unchanged.
9. **No `apps/api` NestJS change without `nestjs-best-practices`; no Prisma query/schema change without `prisma-client-api`.**
10. **Superpowers is mandatory** — invoke the matching `superpowers:*` skill per the Superpowers Workflow table, including `superpowers:verification-before-completion` before any "done" claim.
11. **Planning files are mandatory** for tasks spanning >3 files, >1 session, or 5+ tool calls (`planning-with-files`).
12. **Reply prose is terse (caveman lite), code and written files are not** — see Terse Output Style.
13. **`ponytail:ponytail-debt` when a feature's implementation is done; `ponytail:ponytail-audit` before every release.**
14. **No `git commit` / `push` / `pull` / PR unless explicitly asked** — the user does these manually.
15. **No Playwright test written, fixed or debugged without `playwright-best-practices`.**
16. **`code-review` after every code change; plus `superpowers:requesting-code-review` after a major feature is complete.**
17. **Never invoke `superpowers:using-git-worktrees` or `superpowers:finishing-a-development-branch`.**
