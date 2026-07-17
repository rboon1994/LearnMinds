# Real Account Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Status.INACTIVE` a real, login-permitting account state meaning "hasn't changed their initial temp password yet," instead of Students' cosmetic `mustChangePassword`-derived display trick and Users' currently-unused real column. Both admin tables end up showing genuine account state.

**Architecture:** Relax `auth.service.ts`'s login gate from "must be ACTIVE" to "must not be SUSPENDED." Make `changePassword()` flip `status` to `ACTIVE` at the same moment it clears `mustChangePassword`. Make every place that creates or resets a Student/User's password explicitly set `status: INACTIVE` (schema default is `ACTIVE`, so it must be set, not left alone). Delete Students' derived-status trick now that the real column carries the same meaning.

**Tech Stack:** NestJS + Prisma (backend only — no frontend behavior change beyond one badge-color addition), Jest for backend unit tests.

## Global Constraints

- This changes a shared authentication trust boundary (`auth.service.ts`) — per this repo's hard rule, run a `security-review` pass before considering this done (see Final Steps below).
- `SUSPENDED` must fully block login exactly as `ACTIVE`-only enforcement did before for that state — no regression there.
- The self-serve organization signup flow (`auth.service.ts`'s `register()`) must not change behavior — it already creates `ACTIVE`, non-`mustChangePassword` accounts and this plan doesn't touch that method.
- No new npm packages. No schema/migration changes (the `Status` enum and `User.status` column already exist — only their *enforcement* and *who sets INACTIVE explicitly* changes).
- File naming: kebab-case files, camelCase functions/variables.
- Full spec: `docs/superpowers/specs/2026-07-18-real-account-status-design.md`.

---

## File Structure

**Backend — create:**
- `apps/api/src/auth/auth.service.spec.ts` — unit tests for the relaxed `validateUser` gate and `changePassword`'s new `status: ACTIVE` write
- `apps/api/src/students/students.service.spec.ts` — unit tests for the two status-setting call sites (this module currently has zero test files; per this repo's testing-debt guardrail, touching it is the trigger to add coverage)

**Backend — modify:**
- `apps/api/src/auth/auth.service.ts` — relax `validateUser`'s status gate; `changePassword` sets `status: ACTIVE`
- `apps/api/src/students/students.service.ts` — `bulkRegister`/`resetPassword` set `status: INACTIVE`; delete `toStudentDto` and its call sites now that the real column is authoritative
- `apps/api/src/users/users.service.ts` — `create`/`resetPassword` set `status: INACTIVE`
- `apps/api/src/users/users.service.spec.ts` — append two tests asserting the new `status: INACTIVE` writes

**Frontend — modify:**
- `apps/web/src/app/admin/students/page.tsx` — widen the `Student.status` type and badge rendering to the same 3-color (`ACTIVE`/`INACTIVE`/`SUSPENDED`) pattern `apps/web/src/app/admin/users/page.tsx` already uses

**Frontend — no change needed:**
- `apps/web/src/app/admin/users/page.tsx` already types `status` as the full 3-value union and renders all three badge colors — it already returns the real column from the backend, so it needs nothing further once the backend actually populates meaningful values.

---

### Task 1: Relax the login gate and wire changePassword to flip status

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts:21-29` (`validateUser`), and the `changePassword` method (currently around lines 75-91 — grep for `async changePassword` to confirm the exact line before editing, since earlier tasks in the repo's history may have shifted it slightly)
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: existing `AuthService` constructor (`PrismaService`, `JwtService`), existing `Status` import from `@prisma/client` (already imported in this file).
- Produces: no new exports — `validateUser`/`changePassword` keep their existing signatures; only their internal behavior changes, consumed by the existing (unmodified) `auth.controller.ts` and `LocalAuthGuard`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/auth/auth.service.spec.ts
import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Status } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

function makePrismaMock(user: Record<string, unknown>) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      findUniqueOrThrow: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    },
  };
}

const jwtMock = { sign: jest.fn().mockReturnValue('signed-token') } as any;

describe('AuthService.validateUser', () => {
  it("allows login for an INACTIVE account (hasn't changed its initial password yet)", async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    const prisma = makePrismaMock({ id: 'u1', email: 'a@b.com', password: hashed, status: Status.INACTIVE });
    const svc = new AuthService(prisma as any, jwtMock);
    const user = await svc.validateUser('a@b.com', 'correct-password');
    expect(user.status).toBe(Status.INACTIVE);
  });

  it('still allows login for an ACTIVE account', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    const prisma = makePrismaMock({ id: 'u1', email: 'a@b.com', password: hashed, status: Status.ACTIVE });
    const svc = new AuthService(prisma as any, jwtMock);
    const user = await svc.validateUser('a@b.com', 'correct-password');
    expect(user.status).toBe(Status.ACTIVE);
  });

  it('rejects login for a SUSPENDED account', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    const prisma = makePrismaMock({ id: 'u1', email: 'a@b.com', password: hashed, status: Status.SUSPENDED });
    const svc = new AuthService(prisma as any, jwtMock);
    await expect(svc.validateUser('a@b.com', 'correct-password')).rejects.toThrow(ForbiddenException);
  });
});

describe('AuthService.changePassword', () => {
  it('sets status to ACTIVE alongside clearing mustChangePassword', async () => {
    const hashed = await bcrypt.hash('old-password', 10);
    const prisma = makePrismaMock({ id: 'u1', password: hashed });
    const svc = new AuthService(prisma as any, jwtMock);
    await svc.changePassword('u1', 'new-password');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ mustChangePassword: false, status: Status.ACTIVE }),
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test -- auth.service`
Expected: FAIL — the `INACTIVE` and `SUSPENDED` tests fail because `validateUser` currently throws `ForbiddenException` for any non-`ACTIVE` status (so the `INACTIVE` test fails, and the `SUSPENDED` test's `ForbiddenException` assertion actually passes today — that one may already be green; the `changePassword` test fails because `status: Status.ACTIVE` is never written).

- [ ] **Step 3: Write the implementation**

In `apps/api/src/auth/auth.service.ts`, change:

```ts
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== Status.ACTIVE)
      throw new ForbiddenException('Account is not active');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return user;
  }
```

to:

```ts
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === Status.SUSPENDED)
      throw new ForbiddenException('Account is not active');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return user;
  }
```

And change `changePassword`'s update call from:

```ts
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false },
    });
```

to:

```ts
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false, status: Status.ACTIVE },
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api test -- auth.service`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat(auth): make INACTIVE a real, login-permitting status; ACTIVE on password change"
```

---

### Task 2: Students — set real INACTIVE on create/reset, drop the derived-status trick

**Files:**
- Modify: `apps/api/src/students/students.service.ts` (full method-level changes below)
- Test: `apps/api/src/students/students.service.spec.ts` (new file — this module has no existing tests)

**Interfaces:**
- Consumes: `Status` from `@prisma/client` (new import in this file).
- Produces: `StudentsService.findAll/findOne/update/delete/resetPassword/bulkRegister` keep their existing signatures and are consumed unchanged by `students.controller.ts`; the shape of what they *return* changes only in that `status` is now the real column value instead of a derived one (the field name and its two prior values, `'ACTIVE'`/`'INACTIVE'`, are unchanged strings — only a third possible value, `'SUSPENDED'`, is now reachable, and only via `PATCH /students/:id` since no create/reset path sets it).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/students/students.service.spec.ts
import 'reflect-metadata';
import { Status } from '@prisma/client';
import { StudentsService } from './students.service';

function makePrismaMock() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    student: {
      create: jest.fn().mockResolvedValue({ id: 'student-1' }),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

describe('StudentsService', () => {
  it('bulkRegister creates each new Student with status: INACTIVE', async () => {
    const prisma = makePrismaMock();
    const createSpy = jest.fn();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ student: { create: jest.fn().mockResolvedValue({ id: 'student-1' }) }, user: { create: createSpy } }),
    );
    const svc = new StudentsService(prisma as any);
    await svc.bulkRegister([{ fullName: 'Jane', email: 'jane@example.com', rowNumber: 2 }]);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: Status.INACTIVE }) }),
    );
  });

  it('resetPassword sets status back to INACTIVE', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirstOrThrow.mockResolvedValue({ id: 'user-1', studentId: 'student-1' });
    prisma.user.update.mockResolvedValue({ id: 'user-1', status: Status.INACTIVE });
    const svc = new StudentsService(prisma as any);
    await svc.resetPassword('user-1');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mustChangePassword: true, status: Status.INACTIVE }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test -- students.service`
Expected: FAIL — neither `bulkRegister` nor `resetPassword` currently write `status` at all.

- [ ] **Step 3: Write the implementation**

In `apps/api/src/students/students.service.ts`:

Change the import line:

```ts
import { Prisma, Role } from '@prisma/client';
```

to:

```ts
import { Prisma, Role, Status } from '@prisma/client';
```

Change `selectFields` from:

```ts
const selectFields = {
  id: true,
  studentId: true,
  email: true,
  fullName: true,
  phoneCountryCode: true,
  phoneNo: true,
  mustChangePassword: true,
  lastSignInAt: true,
  createdAt: true,
} as const;
```

to:

```ts
const selectFields = {
  id: true,
  studentId: true,
  email: true,
  fullName: true,
  phoneCountryCode: true,
  phoneNo: true,
  status: true,
  lastSignInAt: true,
  createdAt: true,
} as const;
```

Delete the `toStudentDto` function entirely:

```ts
// The admin-facing "status" is derived from mustChangePassword, not the account status
// enum — a Student is Inactive until they set their own password, Active from then on.
function toStudentDto<T extends { mustChangePassword: boolean }>({
  mustChangePassword,
  ...row
}: T) {
  return {
    ...row,
    status: mustChangePassword ? 'INACTIVE' : ('ACTIVE' as const),
  };
}
```

Change `findAll`'s return from:

```ts
    const result = await paginate<
      Prisma.UserGetPayload<{ select: typeof selectFields }>,
      Prisma.UserWhereInput
    >(
      this.prisma.user,
      { where, select: selectFields, orderBy: { createdAt: 'desc' } },
      { page: query.page, pageSize: query.pageSize },
    );
    return { ...result, data: result.data.map(toStudentDto) };
```

to:

```ts
    return paginate<
      Prisma.UserGetPayload<{ select: typeof selectFields }>,
      Prisma.UserWhereInput
    >(
      this.prisma.user,
      { where, select: selectFields, orderBy: { createdAt: 'desc' } },
      { page: query.page, pageSize: query.pageSize },
    );
```

Change `findOne` from:

```ts
  async findOne(id: string) {
    const row = await this.prisma.user.findFirstOrThrow({
      where: { id, studentId: { not: null } },
      select: selectFields,
    });
    return toStudentDto(row);
  }
```

to:

```ts
  async findOne(id: string) {
    return this.prisma.user.findFirstOrThrow({
      where: { id, studentId: { not: null } },
      select: selectFields,
    });
  }
```

Change `update` from:

```ts
  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);
    try {
      const row = await this.prisma.user.update({
        where: { id },
        data: dto,
        select: selectFields,
      });
      return toStudentDto(row);
    } catch (err) {
```

to:

```ts
  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);
    try {
      return await this.prisma.user.update({
        where: { id },
        data: dto,
        select: selectFields,
      });
    } catch (err) {
```

Change `resetPassword` from:

```ts
  // Back to the fixed bulk-register temp password, with mustChangePassword forcing them off it again.
  async resetPassword(id: string) {
    await this.findOne(id);
    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    const row = await this.prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true },
      select: selectFields,
    });
    return toStudentDto(row);
  }
```

to:

```ts
  // Back to the fixed bulk-register temp password; status returns to INACTIVE until the
  // Student changes it again via /auth/change-password.
  async resetPassword(id: string) {
    await this.findOne(id);
    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    return this.prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true, status: Status.INACTIVE },
      select: selectFields,
    });
  }
```

In `bulkRegister`, change the `tx.user.create` call's `data` from:

```ts
        await tx.user.create({
          data: {
            fullName: row.fullName.trim(),
            email: row.email,
            password: hashed,
            phoneCountryCode: row.phoneCountryCode,
            phoneNo: row.phoneNo,
            role: Role.STUDENT,
            studentId: student.id,
            mustChangePassword: true,
          },
        });
```

to:

```ts
        await tx.user.create({
          data: {
            fullName: row.fullName.trim(),
            email: row.email,
            password: hashed,
            phoneCountryCode: row.phoneCountryCode,
            phoneNo: row.phoneNo,
            role: Role.STUDENT,
            studentId: student.id,
            mustChangePassword: true,
            status: Status.INACTIVE,
          },
        });
```

`delete` is untouched — it never read or returned `status`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api test -- students.service`
Expected: PASS (2/2).

- [ ] **Step 5: Verify the full build still compiles**

Run: `pnpm --filter api exec tsc --noEmit`
Expected: no errors (in particular, confirm nothing outside this file imported `toStudentDto` — it wasn't exported, so this should be safe, but the compiler is the ground truth).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/students/students.service.ts apps/api/src/students/students.service.spec.ts
git commit -m "feat(students): use the real status column instead of a mustChangePassword-derived display value"
```

---

### Task 3: Users — set real INACTIVE on create/reset

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Test: `apps/api/src/users/users.service.spec.ts` (append — do not remove or restructure the existing 6 tests)

**Interfaces:**
- Consumes: `Status` from `@prisma/client` (new import in this file).
- Produces: no signature changes — `create`/`resetPassword` already return the real `status` column via `selectFields`; this task only changes what value gets written at those two call sites.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/users/users.service.spec.ts` (inside the existing `describe('UsersService', ...)` block, after the last test):

```ts
  it('create sets status: INACTIVE on a new row', async () => {
    const prisma = makePrismaMock();
    prisma.user.create.mockResolvedValue({ id: 'user-1', status: 'INACTIVE' });
    const svc = new UsersService(prisma as any);
    await svc.create(
      { scope: UserScope.PLATFORM, fullName: 'Jane', email: 'jane@example.com' } as any,
      null,
    );
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'INACTIVE' }) }),
    );
  });

  it('resetPassword sets status back to INACTIVE', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirstOrThrow.mockResolvedValue({ id: 'user-1', role: Role.USER, tenantId: 'tenant-a' });
    prisma.user.update.mockResolvedValue({ id: 'user-1', status: 'INACTIVE' });
    const svc = new UsersService(prisma as any);
    await svc.resetPassword('user-1', { role: Role.USER, tenantId: 'tenant-a' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mustChangePassword: true, status: 'INACTIVE' }),
      }),
    );
  });
```

- [ ] **Step 2: Run the tests to verify the two new ones fail**

Run: `pnpm --filter api test -- users.service`
Expected: 6 pass, 2 fail (the two new tests) — `create`/`resetPassword` don't write `status` yet.

- [ ] **Step 3: Write the implementation**

Change the import line:

```ts
import { Prisma, Role } from '@prisma/client';
```

to:

```ts
import { Prisma, Role, Status } from '@prisma/client';
```

In `create()`, change:

```ts
          tenantId: role === Role.SUPER_ADMIN ? null : tenantId,
          departmentId: role === Role.USER ? dto.departmentId : undefined,
          mustChangePassword: true,
```

to:

```ts
          tenantId: role === Role.SUPER_ADMIN ? null : tenantId,
          departmentId: role === Role.USER ? dto.departmentId : undefined,
          mustChangePassword: true,
          status: Status.INACTIVE,
```

In `resetPassword()`, change:

```ts
    return this.prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true },
      select: selectFields,
    });
```

to:

```ts
    return this.prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true, status: Status.INACTIVE },
      select: selectFields,
    });
```

- [ ] **Step 4: Run the full file to verify all tests pass**

Run: `pnpm --filter api test -- users.service`
Expected: PASS (8/8).

- [ ] **Step 5: Verify the full build compiles and the whole backend suite passes**

Run: `pnpm --filter api exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter api test`
Expected: all suites pass except the pre-existing, unrelated `courses.service.spec.ts` failure (caused by uncommitted changes to `courses.service.ts` that predate this and the prior plan — not introduced by this work; do not attempt to fix it here).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat(users): set status: INACTIVE on create and reset-password"
```

---

### Task 4: Students admin page — 3-color status badge

**Files:**
- Modify: `apps/web/src/app/admin/students/page.tsx`

**Interfaces:**
- Consumes: the backend's `status` field, now `'ACTIVE' | 'INACTIVE' | 'SUSPENDED'` (previously only ever `'ACTIVE' | 'INACTIVE'`).
- Produces: no new exports — this is a local type/render change only.

- [ ] **Step 1: Widen the `Student` type**

Change (around line 27):

```ts
  status: 'ACTIVE' | 'INACTIVE';
```

to:

```ts
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
```

- [ ] **Step 2: Add a shared badge-class lookup and use it**

Add this near the top of the file, alongside the other `STATUS_*` constants (after `STATUS_SORT_ORDER`, before `phoneKey`):

```ts
const ACCOUNT_STATUS_BADGE_CLASSES: Record<Student['status'], string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  SUSPENDED: 'bg-red-100 text-red-700',
};
```

Change the Status column's `render` (around line 240-248) from:

```tsx
    {
      header: 'Status',
      render: (student) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            student.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {student.status}
        </span>
      ),
    },
```

to:

```tsx
    {
      header: 'Status',
      render: (student) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACCOUNT_STATUS_BADGE_CLASSES[student.status]}`}
        >
          {student.status}
        </span>
      ),
    },
```

- [ ] **Step 3: Verify the frontend build compiles**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/students/page.tsx
git commit -m "feat(students): add SUSPENDED badge color, matching the Users page's 3-state pattern"
```

---

## Final Steps (after all 4 tasks, before considering this done)

- [ ] Run the **security-review** skill against the full diff (`git diff <commit-before-Task-1>..HEAD`) — this change relaxes `auth.service.ts`'s login gate, which is exactly the class of change CLAUDE.md's hard rule requires a security-review pass for. Confirm specifically: `SUSPENDED` still fully blocks login; `register()`'s self-serve signup flow is unaffected; no other code path anywhere depends on `INACTIVE` meaning "blocked" (already checked during design — re-verify against the final diff, not just the plan).
- [ ] Manually verify end-to-end if a dev DB/server is available: create a new User (or Student), confirm it shows `INACTIVE`, log in with it, confirm login succeeds and redirects to Change Password (not a 403), change the password, confirm the table now shows `ACTIVE`.

## Self-Review Notes

- **Spec coverage:** global auth semantic change (Task 1) ✓, Students migrated off the derived-status trick (Task 2) ✓, Users' create/reset set real INACTIVE (Task 3) ✓, Students' badge gets the 3rd color for consistency (Task 4) ✓, Users' page needs no change (confirmed already correct) ✓, security-review gate noted (Final Steps) ✓.
- **Testing debt closed, not created:** `students.service.ts` had zero tests before this plan; Task 2 adds a first, focused spec file for it rather than leaving the gap or silently expanding scope to cover every method — only the two changed behaviors are tested, per this repo's testing-debt guardrail for a module being touched.
- **Out of scope, confirmed with the user:** no new "Suspend account" UI or endpoint is added anywhere — `SUSPENDED` becoming the real login-blocking state is an enforcement-semantics change only; nothing in this plan adds a way to set it.
