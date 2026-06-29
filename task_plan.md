# Task Plan — Auth Module (Register + Login)

**Spec:** `docs/superpowers/specs/2026-06-30-auth-design.md`  
**Goal:** Implement NestJS auth endpoints that the existing frontend signup/login pages call.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Auth strategy | @nestjs/passport + custom AuthService | NestJS-idiomatic, extensible for OAuth later |
| JWT | Access Token only, 7d expiry | MVP simplicity |
| Guard pattern | Global JwtAuthGuard via APP_GUARD + @Public() opt-out | Secure by default |
| Password hashing | bcrypt, rounds=10 | Industry standard |
| Multi-tenancy | Tenant table created on register; User has tenantId | Full isolation via Tenant ID |
| Email verification | Skip — MVP | Confirmed by user |
| Refresh tokens | Skip — MVP | Confirmed by user |

---

## Phases

### Phase 1 — Setup [ ]
- [ ] Install packages (passport, jwt, bcrypt, prisma, class-validator)
- [ ] Create `prisma/schema.prisma` (Tenant + User + enums)
- [ ] Run `prisma migrate dev --name init`
- [ ] Create `apps/api/src/prisma/prisma.service.ts`
- [ ] Create `apps/api/src/prisma/prisma.module.ts`

### Phase 2 — Auth Infrastructure [ ]
- [ ] Create `apps/api/src/auth/dto/register.dto.ts`
- [ ] Create `apps/api/src/auth/dto/login.dto.ts`
- [ ] Create `apps/api/src/auth/decorators/public.decorator.ts`
- [ ] Create `apps/api/src/auth/strategies/local.strategy.ts` (usernameField: 'email')
- [ ] Create `apps/api/src/auth/strategies/jwt.strategy.ts`
- [ ] Create `apps/api/src/auth/guards/local-auth.guard.ts`
- [ ] Create `apps/api/src/auth/guards/jwt-auth.guard.ts`

### Phase 3 — Auth Business Logic [ ]
- [ ] Create `apps/api/src/auth/auth.service.ts` (validateUser, register, login)
- [ ] Create `apps/api/src/auth/auth.controller.ts` (POST /auth/register, POST /auth/login)
- [ ] Create `apps/api/src/auth/auth.module.ts`

### Phase 4 — App Wiring [ ]
- [ ] Update `apps/api/src/app.module.ts` (import PrismaModule, AuthModule, register APP_GUARD)
- [ ] Update `apps/api/src/main.ts` (port 3001, ValidationPipe, enableCors)
- [ ] Update `.env.example` (add FRONTEND_URL)

### Phase 5 — Verification [ ]
- [ ] API starts on port 3001 with no errors
- [ ] POST /auth/register with valid body → { access_token }
- [ ] POST /auth/register duplicate email → 409
- [ ] POST /auth/login correct creds → { access_token }
- [ ] POST /auth/login wrong password → 401
- [ ] POST /auth/login suspended user → 403
- [ ] GET / no token → 401
- [ ] GET / with Bearer token → 200
- [ ] Browser: signup → redirect /learn; login → redirect /learn

---

## Status

- [x] Phase 1
- [x] Phase 2
- [x] Phase 3
- [x] Phase 4
- [x] Phase 5
