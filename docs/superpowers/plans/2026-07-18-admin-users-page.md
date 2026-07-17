# Admin Users Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `apps/web/src/app/admin/users/page.tsx` with a fully working admin page — matching the Students page's design pattern — that lets `SUPER_ADMIN` manage Platform Admins and Tenant Users (via tabs), and `ADMIN` manage their own tenant's Users.

**Architecture:** A new NestJS `users` module (mirroring the existing `students` module's shape) exposes scoped CRUD + reset-password endpoints, gated by the existing `RolesGuard`/`AdminFeatureGuard`/`user-management` `AdminFeature`. The frontend page reuses `AdminLayout`, `AdminTable`, `Dialog`, `SearchableSelect`, `PhoneField`, and the existing `GET /departments` and `GET /tenants` endpoints (the former gains an optional tenant filter for `SUPER_ADMIN` callers) — no new shared UI components are needed.

**Tech Stack:** NestJS + Prisma (backend), Next.js App Router + Tailwind (frontend), class-validator DTOs, Jest for backend unit tests.

## Global Constraints

- Every Prisma query touching `User`/`Department` must filter by `tenantId` — an `ADMIN` caller must never read/write a row outside their own `tenantId`, and must never touch a `role=SUPER_ADMIN` or `role=STUDENT` row.
- No raw SQL DDL — this plan makes no schema changes, so N/A here, but don't add any.
- No new npm packages — everything needed (`class-validator`, `bcrypt`, `react-international-phone` via `PhoneField`) is already installed.
- All external input goes through `class-validator` DTOs, never ad-hoc `if` checks.
- File naming: kebab-case files, camelCase functions/variables.
- CSV bulk register is explicitly **out of scope** for Users (confirmed with user).
- Tenant-admin management (`role=ADMIN` CRUD) is explicitly **out of scope** — deferred to a future "Tenant" page.
- Full spec: `docs/superpowers/specs/2026-07-18-admin-users-page-design.md`.

---

## File Structure

**Backend — create:**
- `apps/api/src/common/temp-password.ts` — shared fixed temp-password constant (currently duplicated-in-spirit only in `students.service.ts`; extracted here so `users.service.ts` reuses it instead of redefining it)
- `apps/api/src/departments/dto/find-departments-query.dto.ts` — optional `tenantId` filter for `GET /departments`
- `apps/api/src/users/dto/user-scope.enum.ts`
- `apps/api/src/users/dto/users-query.dto.ts`
- `apps/api/src/users/dto/create-user.dto.ts`
- `apps/api/src/users/dto/update-user.dto.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/src/users/users.service.spec.ts`
- `apps/api/src/users/users.controller.ts`
- `apps/api/src/users/users.module.ts`

**Backend — modify:**
- `apps/api/src/students/students.service.ts` — use the shared `TEMP_PASSWORD` instead of its own local constant
- `apps/api/src/departments/departments.controller.ts` — accept the tenant filter for `SUPER_ADMIN` callers
- `apps/api/src/app.module.ts` — register `UsersModule`

**Frontend — modify:**
- `apps/web/src/app/admin/users/page.tsx` — full rewrite (currently a `FeatureGate`-only placeholder)

---

### Task 1: Extract shared TEMP_PASSWORD constant

**Files:**
- Create: `apps/api/src/common/temp-password.ts`
- Modify: `apps/api/src/students/students.service.ts:1-12`

**Interfaces:**
- Produces: `TEMP_PASSWORD: string`, importable from `../common/temp-password` (relative to any `apps/api/src/<module>/` file, i.e. `../common/temp-password`).

- [ ] **Step 1: Create the shared constant file**

```ts
// apps/api/src/common/temp-password.ts
// Fixed temp password assigned to every admin-created account (Students today, platform/tenant
// Users next) — mustChangePassword forces the user off it on their first login.
export const TEMP_PASSWORD = 'BeProminds';
```

- [ ] **Step 2: Point students.service.ts at the shared constant**

In `apps/api/src/students/students.service.ts`, replace lines 1-12:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role } from '@prisma/client';
import { paginate } from '../common/paginate';
import { PrismaService } from '../prisma/prisma.service';
import type { StudentRowDto } from './dto/bulk-register-students.dto';
import type { StudentsQueryDto } from './dto/students-query.dto';
import type { UpdateStudentDto } from './dto/update-student.dto';

// Fixed temp password for every bulk-registered Student — no per-row generation/distribution
// needed; mustChangePassword forces them off it on first login.
const TEMP_PASSWORD = 'BeProminds';
```

with:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role } from '@prisma/client';
import { paginate } from '../common/paginate';
import { PrismaService } from '../prisma/prisma.service';
import { TEMP_PASSWORD } from '../common/temp-password';
import type { StudentRowDto } from './dto/bulk-register-students.dto';
import type { StudentsQueryDto } from './dto/students-query.dto';
import type { UpdateStudentDto } from './dto/update-student.dto';
```

- [ ] **Step 3: Verify the build still compiles**

Run: `pnpm --filter api exec tsc --noEmit`
Expected: no errors (in particular, no "TEMP_PASSWORD is declared but never used" or "cannot find name" errors).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/common/temp-password.ts apps/api/src/students/students.service.ts
git commit -m "refactor: extract shared TEMP_PASSWORD constant for reuse by Users module"
```

---

### Task 2: Add SUPER_ADMIN tenant-scoping to GET /departments

**Files:**
- Create: `apps/api/src/departments/dto/find-departments-query.dto.ts`
- Modify: `apps/api/src/departments/departments.controller.ts`

**Interfaces:**
- Consumes: `DepartmentsService.findAll(tenantId: string | null)` (unchanged, already accepts `null`).
- Produces: `GET /departments?tenantId=<id>` — for `ADMIN` callers the query param is ignored (their own `tenantId` always wins); for `SUPER_ADMIN` callers, omitting it returns all departments across all tenants (existing behavior), passing it scopes to that tenant (new).

- [ ] **Step 1: Create the query DTO**

```ts
// apps/api/src/departments/dto/find-departments-query.dto.ts
import { IsOptional, IsString } from 'class-validator';

export class FindDepartmentsQueryDto {
  @IsString()
  @IsOptional()
  tenantId?: string;
}
```

- [ ] **Step 2: Wire it into the controller**

In `apps/api/src/departments/departments.controller.ts`, change the imports (add `Query` and the new DTO):

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { AssignNavItemsDto } from './dto/assign-nav-items.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { FindDepartmentsQueryDto } from './dto/find-departments-query.dto';
import { DepartmentsService } from './departments.service';

type AuthReq = { user: { tenantId: string | null; role: string } };
```

Then replace the `findAll` handler:

```ts
  @Get()
  findAll(@Request() req: AuthReq, @Query() query: FindDepartmentsQueryDto) {
    const tenantId = req.user.role === Role.ADMIN ? req.user.tenantId : (query.tenantId ?? null);
    return this.svc.findAll(tenantId);
  }
```

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm --filter api exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/departments/dto/find-departments-query.dto.ts apps/api/src/departments/departments.controller.ts
git commit -m "feat(departments): let SUPER_ADMIN filter the department list by tenant"
```

---

### Task 3: Users module — DTOs

**Files:**
- Create: `apps/api/src/users/dto/user-scope.enum.ts`
- Create: `apps/api/src/users/dto/users-query.dto.ts`
- Create: `apps/api/src/users/dto/create-user.dto.ts`
- Create: `apps/api/src/users/dto/update-user.dto.ts`

**Interfaces:**
- Produces: `UserScope` enum (`PLATFORM`/`TENANT`), `UsersQueryDto`, `CreateUserDto`, `UpdateUserDto` — all consumed by Task 4 (service) and Task 5 (controller).

- [ ] **Step 1: Create the shared scope enum**

```ts
// apps/api/src/users/dto/user-scope.enum.ts
export enum UserScope {
  PLATFORM = 'platform',
  TENANT = 'tenant',
}
```

- [ ] **Step 2: Create the list query DTO**

```ts
// apps/api/src/users/dto/users-query.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UserScope } from './user-scope.enum';

export class UsersQueryDto extends PaginationQueryDto {
  @IsEnum(UserScope)
  scope: UserScope;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsString()
  @IsOptional()
  search?: string;
}
```

- [ ] **Step 3: Create the create DTO**

```ts
// apps/api/src/users/dto/create-user.dto.ts
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserScope } from './user-scope.enum';

export class CreateUserDto {
  @IsEnum(UserScope)
  scope: UserScope;

  @IsString()
  @MinLength(1)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phoneCountryCode?: string;

  @IsString()
  @IsOptional()
  phoneNo?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  // Only read when scope=TENANT and the caller is SUPER_ADMIN — an ADMIN caller is always
  // forced to their own tenantId server-side, this field is ignored for them.
  @IsString()
  @IsOptional()
  tenantId?: string;
}
```

- [ ] **Step 4: Create the update DTO**

```ts
// apps/api/src/users/dto/update-user.dto.ts
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  fullName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phoneCountryCode?: string;

  @IsString()
  @IsOptional()
  phoneNo?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;
}
```

- [ ] **Step 5: Verify the build compiles**

Run: `pnpm --filter api exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users/dto
git commit -m "feat(users): add DTOs for the new Users admin module"
```

---

### Task 4: Users module — service (with tenant-isolation unit tests)

**Files:**
- Create: `apps/api/src/users/users.service.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `TEMP_PASSWORD` from `../common/temp-password` (Task 1), `paginate` from `../common/paginate`, `UserScope`/`UsersQueryDto`/`CreateUserDto`/`UpdateUserDto` (Task 3).
- Produces: `export type ScopeFilter = { role: Role; tenantId: string } | null;` and `class UsersService` with methods `findAll(query: UsersQueryDto, tenantId: string | null)`, `create(dto: CreateUserDto, tenantId: string | null)`, `update(id: string, dto: UpdateUserDto, scope: ScopeFilter)`, `delete(id: string, scope: ScopeFilter)`, `resetPassword(id: string, scope: ScopeFilter)` — all consumed by Task 5 (controller).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/users/users.service.spec.ts
import 'reflect-metadata';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { UserScope } from './dto/user-scope.enum';

function makePrismaMock() {
  return {
    user: {
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    department: {
      findFirstOrThrow: jest.fn(),
    },
  };
}

describe('UsersService', () => {
  it('findAll scopes the Tenant Users list to the given tenantId, ignoring anything else', async () => {
    const prisma = makePrismaMock();
    const svc = new UsersService(prisma as any);
    await svc.findAll({ scope: UserScope.TENANT, page: 1, pageSize: 10 } as any, 'tenant-a');
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: Role.USER, tenantId: 'tenant-a' }),
      }),
    );
  });

  it('findAll scopes the Platform Admins list to tenantId: null regardless of the tenantId param', async () => {
    const prisma = makePrismaMock();
    const svc = new UsersService(prisma as any);
    await svc.findAll({ scope: UserScope.PLATFORM, page: 1, pageSize: 10 } as any, 'tenant-a');
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: Role.SUPER_ADMIN, tenantId: null }),
      }),
    );
  });

  it('update rejects a row outside the ADMIN scope tenant before writing anything', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirstOrThrow.mockRejectedValue(new Error('not found'));
    const svc = new UsersService(prisma as any);
    await expect(
      svc.update('user-1', { fullName: 'New Name' }, { role: Role.USER, tenantId: 'tenant-a' }),
    ).rejects.toThrow('not found');
    expect(prisma.user.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'user-1', role: Role.USER, tenantId: 'tenant-a' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('delete for SUPER_ADMIN (scope=null) allows role=USER or role=SUPER_ADMIN, never STUDENT', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirstOrThrow.mockResolvedValue({ id: 'user-1', tenantId: null });
    const svc = new UsersService(prisma as any);
    await svc.delete('user-1', null);
    expect(prisma.user.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'user-1', role: { in: [Role.USER, Role.SUPER_ADMIN] } },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('create rejects a departmentId that does not belong to the resolved tenant', async () => {
    const prisma = makePrismaMock();
    prisma.department.findFirstOrThrow.mockRejectedValue(new Error('not found'));
    const svc = new UsersService(prisma as any);
    await expect(
      svc.create(
        {
          scope: UserScope.TENANT,
          fullName: 'Jane',
          email: 'jane@example.com',
          departmentId: 'dept-from-other-tenant',
        } as any,
        'tenant-a',
      ),
    ).rejects.toThrow('not found');
    expect(prisma.department.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'dept-from-other-tenant', tenantId: 'tenant-a' },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test -- users.service`
Expected: FAIL — `Cannot find module './users.service'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/users/users.service.ts
import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role } from '@prisma/client';
import { paginate } from '../common/paginate';
import { PrismaService } from '../prisma/prisma.service';
import { TEMP_PASSWORD } from '../common/temp-password';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UsersQueryDto } from './dto/users-query.dto';
import { UserScope } from './dto/user-scope.enum';

// null = caller is SUPER_ADMIN — may act on any role=USER or role=SUPER_ADMIN row.
// non-null = caller is ADMIN — forced to role=USER rows within their own tenantId.
export type ScopeFilter = { role: Role; tenantId: string } | null;

const selectFields = {
  id: true,
  email: true,
  fullName: true,
  phoneCountryCode: true,
  phoneNo: true,
  status: true,
  role: true,
  tenantId: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  lastSignInAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: UsersQueryDto, tenantId: string | null) {
    const search = query.search?.trim();
    const searchDigits = search?.replace(/\D/g, '');
    const role = query.scope === UserScope.PLATFORM ? Role.SUPER_ADMIN : Role.USER;
    const where: Prisma.UserWhereInput = {
      role,
      tenantId: query.scope === UserScope.PLATFORM ? null : tenantId,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              ...(searchDigits
                ? [
                    { phoneNo: { contains: searchDigits } },
                    { phoneCountryCode: { contains: searchDigits } },
                  ]
                : []),
            ],
          }
        : {}),
    };
    return paginate<Prisma.UserGetPayload<{ select: typeof selectFields }>, Prisma.UserWhereInput>(
      this.prisma.user,
      { where, select: selectFields, orderBy: { createdAt: 'desc' } },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  // Guards against an ADMIN assigning a departmentId that belongs to a different tenant —
  // Prisma's FK alone doesn't stop a valid-but-foreign departmentId from being written.
  private async assertDepartmentInTenant(departmentId: string, tenantId: string) {
    await this.prisma.department.findFirstOrThrow({ where: { id: departmentId, tenantId } });
  }

  async create(dto: CreateUserDto, tenantId: string | null) {
    const role = dto.scope === UserScope.PLATFORM ? Role.SUPER_ADMIN : Role.USER;
    if (role === Role.USER && dto.departmentId) {
      await this.assertDepartmentInTenant(dto.departmentId, tenantId as string);
    }
    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    try {
      return await this.prisma.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email,
          password: hashed,
          phoneCountryCode: dto.phoneCountryCode,
          phoneNo: dto.phoneNo,
          role,
          tenantId,
          departmentId: role === Role.USER ? dto.departmentId : undefined,
          mustChangePassword: true,
        },
        select: selectFields,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  private findOneScoped(id: string, scope: ScopeFilter) {
    return this.prisma.user.findFirstOrThrow({
      where: scope
        ? { id, role: scope.role, tenantId: scope.tenantId }
        : { id, role: { in: [Role.USER, Role.SUPER_ADMIN] } },
    });
  }

  async update(id: string, dto: UpdateUserDto, scope: ScopeFilter) {
    const existing = await this.findOneScoped(id, scope);
    if (dto.departmentId && existing.tenantId) {
      await this.assertDepartmentInTenant(dto.departmentId, existing.tenantId);
    }
    try {
      return await this.prisma.user.update({ where: { id }, data: dto, select: selectFields });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  async delete(id: string, scope: ScopeFilter) {
    await this.findOneScoped(id, scope);
    await this.prisma.user.delete({ where: { id } });
  }

  async resetPassword(id: string, scope: ScopeFilter) {
    await this.findOneScoped(id, scope);
    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    return this.prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true },
      select: selectFields,
    });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api test -- users.service`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat(users): add UsersService with tenant-isolation-safe CRUD"
```

---

### Task 5: Users module — controller, module, and app registration

**Files:**
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/users.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `UsersService` (Task 4), `UserScope`/`UsersQueryDto`/`CreateUserDto`/`UpdateUserDto` (Task 3), `RolesGuard`/`AdminFeatureGuard`/`Roles`/`RequireFeature` (existing, from `students`/`departments` modules).
- Produces: `GET/POST /users`, `PATCH /users/:id`, `DELETE /users/:id`, `PATCH /users/:id/reset-password` — consumed by the frontend page (Task 6).

- [ ] **Step 1: Create the controller**

```ts
// apps/api/src/users/users.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersQueryDto } from './dto/users-query.dto';
import { UserScope } from './dto/user-scope.enum';
import { UsersService, ScopeFilter } from './users.service';

type AuthReq = { user: { tenantId: string | null; role: Role } };

// SUPER_ADMIN always bypasses both RolesGuard and AdminFeatureGuard (per their existing
// implementations) — @Roles(Role.ADMIN) here only grants the ADMIN role explicitly.
// scope=platform (Platform Admins) is further restricted to SUPER_ADMIN per-method below.
@Controller('users')
@UseGuards(RolesGuard, AdminFeatureGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get()
  findAll(@Query() query: UsersQueryDto, @Request() req: AuthReq) {
    if (query.scope === UserScope.PLATFORM && req.user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException();
    }
    if (query.scope === UserScope.TENANT && req.user.role === Role.ADMIN) {
      return this.svc.findAll(query, req.user.tenantId as string);
    }
    const tenantId = query.scope === UserScope.TENANT ? (query.tenantId ?? null) : null;
    if (query.scope === UserScope.TENANT && !tenantId) {
      return { data: [], total: 0, page: query.page, pageSize: query.pageSize, totalPages: 1 };
    }
    return this.svc.findAll(query, tenantId);
  }

  @Post()
  @RequireFeature('user-management')
  create(@Body() dto: CreateUserDto, @Request() req: AuthReq) {
    if (dto.scope === UserScope.PLATFORM && req.user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException();
    }
    const tenantId =
      dto.scope === UserScope.TENANT
        ? req.user.role === Role.ADMIN
          ? req.user.tenantId
          : (dto.tenantId ?? null)
        : null;
    if (dto.scope === UserScope.TENANT && !tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.svc.create(dto, tenantId);
  }

  @Patch(':id')
  @RequireFeature('user-management')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Request() req: AuthReq) {
    return this.svc.update(id, dto, this.scopeFilter(req));
  }

  @Delete(':id')
  @RequireFeature('user-management')
  delete(@Param('id') id: string, @Request() req: AuthReq) {
    return this.svc.delete(id, this.scopeFilter(req));
  }

  @Patch(':id/reset-password')
  @RequireFeature('user-management')
  resetPassword(@Param('id') id: string, @Request() req: AuthReq) {
    return this.svc.resetPassword(id, this.scopeFilter(req));
  }

  private scopeFilter(req: AuthReq): ScopeFilter {
    return req.user.role === Role.ADMIN
      ? { role: Role.USER, tenantId: req.user.tenantId as string }
      : null;
  }
}
```

- [ ] **Step 2: Create the module**

```ts
// apps/api/src/users/users.module.ts
import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, RolesGuard, AdminFeatureGuard],
})
export class UsersModule {}
```

- [ ] **Step 3: Register it in app.module.ts**

In `apps/api/src/app.module.ts`, add the import:

```ts
import { UsersModule } from './users/users.module';
```

and add `UsersModule` to the `imports` array (after `StudentsModule`):

```ts
    StudentsModule,
    UsersModule,
    TenantsModule,
```

- [ ] **Step 4: Verify the build compiles and existing tests still pass**

Run: `pnpm --filter api exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter api test`
Expected: PASS (all suites, including the new `users.service.spec.ts` and the pre-existing `roles.guard.spec.ts`).

- [ ] **Step 5: Manually smoke-test the endpoint**

Run: `pnpm --filter api dev` (in one terminal), then in another:

```bash
curl -s -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -d '{"email":"<a real SUPER_ADMIN test account>","password":"<its password>"}'
```

Copy the `access_token` from the response, then:

```bash
curl -s http://localhost:3001/users?scope=platform -H "Authorization: Bearer <token>"
```

Expected: `200` with `{ "data": [...], "total": ..., "page": 1, "pageSize": 10, "totalPages": ... }` containing at least the logged-in Super Admin's own row.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users/users.controller.ts apps/api/src/users/users.module.ts apps/api/src/app.module.ts
git commit -m "feat(users): wire up the Users controller, module, and app registration"
```

---

### Task 6: Frontend — Users admin page

**Files:**
- Modify: `apps/web/src/app/admin/users/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `GET/POST /users`, `PATCH /users/:id`, `DELETE /users/:id`, `PATCH /users/:id/reset-password` (Task 5); `GET /departments?tenantId=` (Task 2, existing endpoint); `GET /tenants` (existing, unmodified); `AdminLayout`, `AdminTable`, `Dialog`/`ConfirmDialog`/`ConfirmDeleteDialog`, `FeatureGate`, `Input`, `PhoneField`, `SearchableSelect`, `Button`, `Alert`, `Icon`, `useToast`, `useAuth`, `apiUrl`, `parsePhone` (all existing, unmodified).

- [ ] **Step 1: Replace the placeholder page**

Replace the entire contents of `apps/web/src/app/admin/users/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminTable } from '@/components/ui/AdminTable';
import type { AdminTableColumn } from '@/components/ui/AdminTable';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteDialog, ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { FeatureGate } from '@/components/ui/FeatureGate';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { PhoneField } from '@/components/ui/PhoneField';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import type { SelectOption } from '@/components/ui/SearchableSelect';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import { parsePhone } from '@/lib/phone';

type Tab = 'platform' | 'tenant';

type ManagedUser = {
  id: string;
  email: string;
  fullName: string;
  phoneCountryCode: string | null;
  phoneNo: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  role: 'SUPER_ADMIN' | 'USER';
  tenantId: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  lastSignInAt: string | null;
};

const STATUS_BADGE_CLASSES: Record<ManagedUser['status'], string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  SUSPENDED: 'bg-red-100 text-red-700',
};

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

function validateUserForm(prefix: 'create' | 'edit', fullName: string, email: string, phoneNo: string) {
  if (!fullName.trim()) return { error: "Please enter the user's full name", field: `${prefix}FullName` };
  if (!email.trim()) return { error: 'Please enter an email address', field: `${prefix}Email` };
  if (!phoneNo) return { error: 'Please enter a valid phone number', field: `${prefix}Phone` };
  return null;
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [activeTab, setActiveTab] = useState<Tab>('platform');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenants, setTenants] = useState<SelectOption[]>([]);
  const [departments, setDepartments] = useState<SelectOption[]>([]);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createFullName, setCreateFullName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createDialCode, setCreateDialCode] = useState('60');
  const [createDepartmentId, setCreateDepartmentId] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDialCode, setEditDialCode] = useState('60');
  const [editDepartmentId, setEditDepartmentId] = useState('');
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmResetPassword, setConfirmResetPassword] = useState(false);

  // ADMIN is always scoped to their own tenant; SUPER_ADMIN on the Tenant Users tab must pick one.
  const scopeTenantId = user?.role === 'ADMIN' ? (user.tenant?.id ?? '') : selectedTenantId;

  const load = () => {
    if (activeTab === 'tenant' && !scopeTenantId) {
      setUsers([]);
      setTotal(0);
      return;
    }
    const params = new URLSearchParams({ scope: activeTab, page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (activeTab === 'tenant' && scopeTenantId) params.set('tenantId', scopeTenantId);
    fetch(`${apiUrl}/users?${params.toString()}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((res: { data: ManagedUser[]; total: number }) => {
        setUsers(res.data);
        setTotal(res.total);
      })
      .catch(() => {});
  };

  const loadDepartments = () => {
    if (!scopeTenantId) {
      setDepartments([]);
      return;
    }
    fetch(`${apiUrl}/departments?tenantId=${scopeTenantId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) =>
        setDepartments(data.map((d) => ({ value: d.id, label: d.name }))),
      )
      .catch(() => {});
  };

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router, activeTab, scopeTenantId, page, debouncedSearch]);

  useEffect(() => {
    if (!user || activeTab !== 'tenant') return;
    if (isSuperAdmin) {
      fetch(`${apiUrl}/tenants`, { headers: authHeaders() })
        .then((r) => r.json())
        .then((data: { id: string; name: string }[]) =>
          setTenants(data.map((t) => ({ value: t.id, label: t.name }))),
        )
        .catch(() => {});
    }
    loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeTab, scopeTenantId]);

  const columns: AdminTableColumn<ManagedUser>[] = [
    { header: 'Full Name', render: (row) => row.fullName },
    { header: 'Email Address', render: (row) => row.email },
    {
      header: 'Phone Number',
      render: (row) =>
        row.phoneCountryCode || row.phoneNo ? `${row.phoneCountryCode ?? ''}${row.phoneNo ?? ''}`.trim() : '—',
    },
    {
      header: 'Department',
      hidden: activeTab === 'platform',
      render: (row) => row.department?.name ?? '—',
    },
    {
      header: 'Status',
      render: (row) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[row.status]}`}>
          {row.status}
        </span>
      ),
    },
  ];

  if (user && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') return null;

  const openCreateDialog = () => setIsCreateOpen(true);

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setCreateFullName('');
    setCreateEmail('');
    setCreatePhone('');
    setCreateDialCode('60');
    setCreateDepartmentId('');
    setCreateError('');
  };

  const createUser = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const { phoneCountryCode, phoneNo } = parsePhone(createPhone, createDialCode);
    const validation = validateUserForm('create', createFullName, createEmail, phoneNo);
    if (validation) {
      setCreateError(validation.error);
      setTimeout(() => document.getElementById(validation.field)?.focus(), 0);
      return;
    }
    setIsCreating(true);
    setCreateError('');
    const res = await fetch(`${apiUrl}/users`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: activeTab,
        fullName: createFullName,
        email: createEmail,
        phoneCountryCode,
        phoneNo,
        departmentId: activeTab === 'tenant' ? createDepartmentId || undefined : undefined,
        tenantId: activeTab === 'tenant' && isSuperAdmin ? scopeTenantId : undefined,
      }),
    });
    setIsCreating(false);
    if (!res.ok) {
      if (res.status === 409) setCreateError('Email already registered');
      else setCreateError('Failed to create user');
      return;
    }
    toast.saved();
    closeCreateDialog();
    load();
  };

  const openEditDialog = (row: ManagedUser) => {
    setEditingUser(row);
    setEditFullName(row.fullName);
    setEditEmail(row.email);
    setEditPhone(row.phoneCountryCode && row.phoneNo ? `+${row.phoneCountryCode}${row.phoneNo}` : '');
    setEditDialCode(row.phoneCountryCode || '60');
    setEditDepartmentId(row.departmentId ?? '');
    setEditError('');
  };

  const closeEditDialog = () => {
    setEditingUser(null);
    setConfirmDelete(false);
    setConfirmResetPassword(false);
  };

  const saveUser = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!editingUser) return;
    const { phoneCountryCode, phoneNo } = parsePhone(editPhone, editDialCode);
    const validation = validateUserForm('edit', editFullName, editEmail, phoneNo);
    if (validation) {
      setEditError(validation.error);
      setTimeout(() => document.getElementById(validation.field)?.focus(), 0);
      return;
    }
    setIsSaving(true);
    setEditError('');
    const res = await fetch(`${apiUrl}/users/${editingUser.id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: editFullName,
        email: editEmail,
        phoneCountryCode,
        phoneNo,
        departmentId: editingUser.role === 'USER' ? editDepartmentId || undefined : undefined,
      }),
    });
    setIsSaving(false);
    if (!res.ok) {
      if (res.status === 409) setEditError('Email already registered');
      else toast.saveFailed();
      return;
    }
    toast.saved();
    closeEditDialog();
    load();
  };

  const resetUserPassword = async () => {
    if (!editingUser) return;
    const res = await fetch(`${apiUrl}/users/${editingUser.id}/reset-password`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.saveFailed();
      return;
    }
    toast.reset();
  };

  const deleteUser = async () => {
    if (!editingUser) return;
    const res = await fetch(`${apiUrl}/users/${editingUser.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      toast.deleteFailed();
      return;
    }
    toast.deleted();
    closeEditDialog();
    load();
  };

  return (
    <AdminLayout
      title="Users"
      backHref="/admin"
      actions={
        <Button onClick={openCreateDialog} variant="gradient">
          New User
        </Button>
      }
    >
      <FeatureGate featureKey="user-management">
        {isSuperAdmin && (
          <div className="mb-4 flex gap-2">
            {(['platform', 'tenant'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setPage(1);
                }}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab === 'platform' ? 'Platform Admins' : 'Tenant Users'}
              </button>
            ))}
          </div>
        )}

        <AdminTable
          columns={columns}
          data={users}
          keyField="id"
          onRowClick={openEditDialog}
          emptyMessage={
            activeTab === 'tenant' && !scopeTenantId
              ? 'Select a tenant to view its users.'
              : total === 0 && !debouncedSearch
                ? 'No users yet.'
                : 'No users match your search.'
          }
          pagination={{ page, pageSize, total, onPageChange: setPage }}
          toolbar={
            <>
              <div className="flex-1 min-w-50">
                <Input
                  id="searchUsers"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by full name, email address, or phone number..."
                  value={search}
                />
              </div>
              {isSuperAdmin && activeTab === 'tenant' && (
                <div className="w-56">
                  <SearchableSelect
                    id="tenantFilter"
                    placeholder="Select tenant..."
                    options={tenants}
                    value={selectedTenantId}
                    onChange={(value) => {
                      setSelectedTenantId(value);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </>
          }
        />
      </FeatureGate>

      <Dialog isOpen={isCreateOpen} onClose={closeCreateDialog} title="New User">
        <form className="space-y-5" onSubmit={createUser} noValidate>
          <Input
            autoFocus
            id="createFullName"
            label="Full Name"
            onChange={(e) => setCreateFullName(e.target.value)}
            required
            value={createFullName}
          />
          <Input
            id="createEmail"
            label="Email Address"
            onChange={(e) => setCreateEmail(e.target.value)}
            required
            type="email"
            value={createEmail}
          />
          <PhoneField
            id="createPhone"
            label="Phone Number"
            required
            variant="default"
            onChange={(phone, dialCode) => {
              setCreatePhone(phone);
              setCreateDialCode(dialCode);
            }}
            value={createPhone}
          />
          {activeTab === 'tenant' && (
            <SearchableSelect
              id="createDepartmentId"
              label="Department"
              options={departments}
              value={createDepartmentId}
              onChange={setCreateDepartmentId}
            />
          )}
          {createError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {createError}
            </Alert>
          )}
          <Button type="submit" isLoading={isCreating} loadingLabel="Creating...">
            Create User
          </Button>
        </form>
      </Dialog>

      <Dialog isOpen={editingUser !== null} onClose={closeEditDialog} title="Edit User">
        <form className="space-y-5" onSubmit={saveUser} noValidate>
          <Input
            autoFocus
            id="editFullName"
            label="Full Name"
            onChange={(e) => setEditFullName(e.target.value)}
            required
            value={editFullName}
          />
          <Input
            id="editEmail"
            label="Email Address"
            onChange={(e) => setEditEmail(e.target.value)}
            required
            type="email"
            value={editEmail}
          />
          <PhoneField
            id="editPhone"
            label="Phone Number"
            required
            variant="default"
            onChange={(phone, dialCode) => {
              setEditPhone(phone);
              setEditDialCode(dialCode);
            }}
            value={editPhone}
          />
          {editingUser?.role === 'USER' && (
            <SearchableSelect
              id="editDepartmentId"
              label="Department"
              options={departments}
              value={editDepartmentId}
              onChange={setEditDepartmentId}
            />
          )}
          {editError && (
            <Alert type="error" icon={<Icon name="error" className="h-4 w-4" />}>
              {editError}
            </Alert>
          )}
          <div className="flex gap-3">
            <Button type="submit" isLoading={isSaving} loadingLabel="Saving...">
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmResetPassword(true)}
              leftIcon={<Icon name="lock" className="h-4 w-4 mr-1.5" />}
            >
              Reset Password
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              leftIcon={<Icon name="trash" className="h-4 w-4 mr-1.5" />}
            >
              Delete
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDeleteDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteUser}
        title="Delete User"
        userEmail={user?.email ?? ''}
      />

      <ConfirmDialog
        isOpen={confirmResetPassword}
        onClose={() => setConfirmResetPassword(false)}
        onConfirm={resetUserPassword}
        title="Reset Password"
        description={`Reset password for ${editingUser?.email ?? 'this user'}? They will need to set a new password on next login.`}
        confirmLabel="Reset Password"
      />
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Verify the frontend build compiles**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification in the browser**

Run: `pnpm --filter api dev` (terminal 1), `pnpm --filter web dev` (terminal 2), then in a browser:

1. Log in as a `SUPER_ADMIN` test account, navigate to `/admin/users`.
   Expected: two tabs ("Platform Admins", "Tenant Users"); "Platform Admins" shows at least the logged-in account; clicking "New User" opens the create dialog with no Department field; creating one succeeds and appears in the table.
2. Switch to "Tenant Users" tab.
   Expected: empty state "Select a tenant to view its users." until a tenant is picked from the dropdown; after picking one, the table loads (may be empty) and the create dialog now shows a Department field.
3. Create a Tenant User, then click its row.
   Expected: edit dialog opens pre-filled; Save / Reset Password / Delete all work end-to-end (toast confirmations appear, table refreshes).
4. Log in as an `ADMIN` test account, navigate to `/admin/users`.
   Expected: no tabs; table is pre-scoped to their own tenant's Users; Department field present in both dialogs.
5. Log in as a `USER` or `STUDENT` test account, navigate to `/admin/users` directly.
   Expected: redirected to `/admin`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/users/page.tsx
git commit -m "feat(users): build the real Users admin page, matching the Students page pattern"
```

---

## Self-Review Notes

- **Spec coverage:** tabs (Task 6) ✓, backend scope/tenant/role rules (Task 5 + 4) ✓, department dropdown restricted to Tenant Users (Task 6) ✓, no bulk register (confirmed absent) ✓, Save/Reset Password/Delete trio (Task 6) ✓, duplicate-email 409 handling (Task 4 + 6) ✓, SUPER_ADMIN empty-tenant-selection state (Task 6) ✓, non-SUPER_ADMIN/ADMIN redirect (Task 6) ✓, tenant isolation on every query (Task 4, unit-tested) ✓.
- **Added beyond the original spec, both required for the spec to actually work safely:** the `GET /departments` tenant-filter extension (Task 2) and the cross-tenant `departmentId` guard in `UsersService` (Task 4) — without the former the department dropdown couldn't be scoped for `SUPER_ADMIN`, and without the latter an `ADMIN` could otherwise assign a department belonging to a different tenant.
- **Testing debt:** per CLAUDE.md's guardrail, `UsersService`'s tenant-isolation logic gets unit tests (Task 4) since it's exactly the core-business-logic case that guardrail calls out; the controller and frontend page are verified manually (no e2e/frontend test harness exists in this repo yet — out of scope to add one here).
