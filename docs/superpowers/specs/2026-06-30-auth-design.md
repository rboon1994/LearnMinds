# Auth Module Design — Register + Login

**Date:** 2026-06-30  
**Scope:** NestJS backend auth (register, login, JWT guard). Frontend pages already built.

---

## Context

The frontend has working signup and login pages that call:
- `POST /auth/register` — `{ fullName, email, password, organization }`
- `POST /auth/login` — `{ email, password }` → expects `{ access_token }`

The NestJS API is a blank scaffold. This spec covers everything needed to make those two endpoints work, including Prisma schema, multi-tenant model, and JWT guard setup.

---

## Architecture

```
AppModule
├── PrismaModule (global)      — database client
└── AuthModule
    ├── AuthController         POST /auth/register, POST /auth/login
    ├── AuthService            register() / login() / validateUser()
    ├── LocalStrategy          passport-local: validates email + password
    ├── JwtStrategy            passport-jwt: decodes Bearer token
    ├── JwtAuthGuard           wraps JwtStrategy — used as APP_GUARD
    ├── LocalAuthGuard         wraps LocalStrategy — used on POST /auth/login
    └── @Public() decorator    opts routes out of the global JwtAuthGuard
```

**Global guard pattern:** `JwtAuthGuard` registered as `APP_GUARD` in `AppModule`. All routes are protected by default. Routes that should be public (register, login) are decorated with `@Public()`. This prevents accidentally leaving a route unprotected.

---

## Database Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  SUPER_ADMIN   // Platform staff — full access to all Tenants
  ADMIN         // Tenant admin — created on registration, manages own Tenant's users
  USER          // Tenant member
}

enum Status {
  ACTIVE
  INACTIVE
  SUSPENDED
}

enum TenantPackage {
  FREE
  PRO
  ENTERPRISE
}

model Tenant {
  id        String        @id @default(cuid())
  name      String
  package   TenantPackage @default(FREE)
  status    Status        @default(ACTIVE)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  users     User[]
}

model User {
  id                 String    @id @default(cuid())
  email              String    @unique
  password           String    // bcrypt hash
  fullName           String
  phoneCountryCode   String?
  phoneNo            String?
  role               Role      @default(USER)
  status             Status    @default(ACTIVE)
  mustChangePassword Boolean   @default(false)
  department         String?
  jobTitle           String?
  lastSignInAt       DateTime?
  tenantId           String
  tenant             Tenant    @relation(fields: [tenantId], references: [id])
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}
```

**Migration:** `prisma migrate dev --name init`

---

## JWT

- **Payload:** `{ sub: userId, tenantId, email, role }`
- **Algorithm:** HS256 (default)
- **Expiry:** `JWT_EXPIRES_IN=7d` (from env)
- **Secret:** `JWT_SECRET` (from env)
- **No refresh tokens in MVP** — user re-authenticates after 7 days

---

## Endpoints

### POST /auth/register

```
@Public()
Body: { fullName: string, email: string, password: string, organization: string }

Flow:
  1. email already exists → 409 ConflictException
  2. bcrypt.hash(password, 10)
  3. prisma.$transaction:
     a. Tenant.create { name: organization, status: ACTIVE }
     b. User.create { fullName, email, hashedPassword, tenantId, role: ADMIN, status: ACTIVE }
  4. User.update { lastSignInAt: now() }
  5. Return { access_token: jwt.sign({ sub, tenantId, email, role }) }
```

### POST /auth/login

```
@Public()
@UseGuards(LocalAuthGuard)   ← LocalStrategy validates here
Body: { email: string, password: string }

LocalStrategy config:
  super({ usernameField: 'email' })  ← passport-local defaults to 'username'; must override

LocalStrategy.validate:
  1. User not found → UnauthorizedException
  2. User.status === SUSPENDED → ForbiddenException
  3. bcrypt.compare(password, user.password) fails → UnauthorizedException
  4. Returns user object

AuthController.login:
  1. User.update { lastSignInAt: now() }
  2. Return { access_token: jwt.sign({ sub, tenantId, email, role }) }
```

---

## Authorization (post-MVP — noted for future work)

The JWT payload includes `role`. Future `RolesGuard` + `@Roles()` decorator will enforce:

| Role | Access |
|---|---|
| `SUPER_ADMIN` | CRUD all Tenants + all Users |
| `ADMIN` | CRUD Users within own `tenantId` only |
| `USER` | Own profile data only |

---

## Files to Create

### New packages required

```
pnpm add --filter api @nestjs/passport passport passport-local passport-jwt @nestjs/jwt @nestjs/config bcrypt class-validator class-transformer
pnpm add --filter api prisma @prisma/client
pnpm add --filter api -D @types/passport-local @types/passport-jwt @types/bcrypt
```

> Prisma 放在 `apps/api/prisma/` — Prisma 只服务于 API，跟着 API package 走。
> `@nestjs/config` included — NestJS 标配，后续 Stripe/AI keys 都会用到。

### New files

| File | Purpose |
|---|---|
| `apps/api/prisma/schema.prisma` | Tenant + User models |
| `apps/api/src/prisma/prisma.service.ts` | PrismaClient wrapper |
| `apps/api/src/prisma/prisma.module.ts` | Global Prisma module |
| `apps/api/src/auth/dto/register.dto.ts` | Validation DTO |
| `apps/api/src/auth/dto/login.dto.ts` | Validation DTO |
| `apps/api/src/auth/strategies/local.strategy.ts` | passport-local |
| `apps/api/src/auth/strategies/jwt.strategy.ts` | passport-jwt |
| `apps/api/src/auth/guards/jwt-auth.guard.ts` | JwtAuthGuard (APP_GUARD) |
| `apps/api/src/auth/guards/local-auth.guard.ts` | LocalAuthGuard |
| `apps/api/src/auth/decorators/public.decorator.ts` | @Public() |
| `apps/api/src/auth/auth.service.ts` | Business logic |
| `apps/api/src/auth/auth.controller.ts` | Route handlers |
| `apps/api/src/auth/auth.module.ts` | Module wiring |

### Modified files

| File | Change |
|---|---|
| `apps/api/src/app.module.ts` | Import PrismaModule, AuthModule; register APP_GUARD |
| `apps/api/src/main.ts` | Port → 3001; enable ValidationPipe; enableCors({ origin: FRONTEND_URL \|\| 'http://localhost:3000', credentials: true }) |

---

## Verification

1. `pnpm --filter api dev` starts on port 3001 with no errors
2. `POST http://localhost:3001/auth/register` with valid body → `{ access_token: "..." }`
3. `POST http://localhost:3001/auth/register` same email twice → 409
4. `POST http://localhost:3001/auth/login` with correct creds → `{ access_token: "..." }`
5. `POST http://localhost:3001/auth/login` wrong password → 401
6. `POST http://localhost:3001/auth/login` suspended user → 403
7. `GET http://localhost:3001` (protected route) no token → 401
8. `GET http://localhost:3001` with `Authorization: Bearer <token>` → 200
9. Browser: signup page → redirect to `/learn`; login page → redirect to `/learn`
