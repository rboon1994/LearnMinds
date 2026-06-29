# Findings

## Codebase State (explored 2026-06-30)

### apps/api
- Blank NestJS 11 scaffold — only AppModule, AppController, AppService, main.ts
- No auth code, no Prisma, no JWT packages
- `main.ts` default port is `process.env.PORT ?? 3000` — must change to 3001
- `type: "commonjs"` in package.json — standard NestJS CJS

### packages/shared-types
- Empty (`export {}`) — no shared types yet

### Prisma location
- `apps/api/prisma/schema.prisma` — Prisma lives inside the API package (not monorepo root)
- `prisma migrate dev` runs from `apps/api/` directory

### .env.example
- `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN=7d`, `PORT=3001` already defined
- `NEXT_PUBLIC_API_URL=http://localhost:3001` already defined
- Missing: `FRONTEND_URL` (needed for CORS config)

### Frontend (already built)
- `apps/web/src/app/login/page.tsx` — POST /auth/login, stores `access_token` in localStorage
- `apps/web/src/app/signup/page.tsx` — POST /auth/register with { fullName, email, password, organization }
- Both redirect to `/learn` on success
- `apps/web/src/lib/api.ts` — shared `apiUrl` constant

## Key Technical Notes

- `passport-local` defaults to `req.body.username` — must configure `usernameField: 'email'` in LocalStrategy
- CORS: `credentials: true` required (for Authorization header); `origin: '*'` is incompatible with credentials; use `FRONTEND_URL || 'http://localhost:3000'`
- `prisma.$transaction` for atomic Tenant + User creation on register
- JWT payload: `{ sub: userId, tenantId, email, role }` — role included so future RolesGuard requires no DB lookup
- Global APP_GUARD + @Public() pattern: secure by default, opt-out for public routes
- bcrypt rounds: 10 (standard)
- `@nestjs/config` installed — ConfigService used to inject JWT_SECRET and JWT_EXPIRES_IN into JwtModule.registerAsync()
