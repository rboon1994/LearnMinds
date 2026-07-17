# Admin Users Page — Design

Status: Approved (3 review rounds — page structure/tabs, backend API shape, frontend components +
error handling)
Date: 2026-07-18

## Problem

`apps/web/src/app/admin/users/page.tsx` is currently a placeholder — a `FeatureGate` wrapper around
a static "Manage tenant users." heading, with no table, no CRUD, and no backing API. Meanwhile
`apps/web/src/app/admin/students/page.tsx` is a fully built admin management page (searchable/
paginated table, create/edit dialogs, CSV bulk register, reset password, delete). The user wants the
Users page brought up to the same design and functional pattern as the Students page.

## Scope boundary (explicitly out of scope)

- **Tenant Admin management** (creating/editing `role=ADMIN` users) is deferred to a separate future
  "Tenant" page — not part of this spec.
- **CSV bulk register** is explicitly not needed for Users (user volume is much lower than
  Students) — only single "New User" creation.
- **Department-admin as a distinct role** does not exist in the codebase — the `Role` enum is
  `SUPER_ADMIN | ADMIN | USER | STUDENT`. "Tenant admin" in conversation maps to `Role.ADMIN`
  scoped by `User.tenantId`, matching the existing pattern in `departments.controller.ts`
  (`@Roles(Role.ADMIN)`).

## Page structure & tabs

`apps/web/src/app/admin/users/page.tsx` becomes a real page built from the same components as
Students (`AdminLayout`, `AdminTable`, `Dialog`, `Input`, `PhoneField`, `Button`, `Alert`, `Icon`,
`useToast`), so visual consistency comes from shared components rather than hand-matched CSS.

- **`SUPER_ADMIN`**: two tabs —
  - **"Platform Admins"**: manages `role=SUPER_ADMIN, tenantId=null` users.
  - **"Tenant Users"**: manages `role=USER` users, with a tenant-filter dropdown (SUPER_ADMIN spans
    all tenants, so this tab needs an explicit tenant selection before it queries).
- **`ADMIN`** (tenant admin): no tabs — just the "Tenant Users" table, implicitly scoped to their
  own `tenantId` (never client-selectable).
- Any other role hitting `/admin/users`: redirect guard (`router.replace('/admin')`), same pattern
  as `AdminStudentsPage`'s existing `user.role !== 'SUPER_ADMIN'` check, extended to allow both
  `SUPER_ADMIN` and `ADMIN`.

## Backend API

New `apps/api/src/users` module (mirrors the shape of `apps/api/src/students`), guarded by
`RolesGuard` allowing `SUPER_ADMIN` and `ADMIN`:

- `GET /users?scope=platform|tenant&tenantId=&search=&page=&pageSize=`
  - `scope=platform`: requires `SUPER_ADMIN`; returns `role=SUPER_ADMIN, tenantId=null` rows.
  - `scope=tenant`: returns `role=USER` rows filtered by `tenantId`. For `ADMIN` callers, `tenantId`
    is forced server-side to the caller's own `tenantId` (query param ignored/rejected, never
    trusted from the client). For `SUPER_ADMIN` callers, `tenantId` is an optional filter param —
    omitting it means no tenant scoped yet (frontend shows an empty-state prompt, not an unscoped
    query — see Error handling below).
- `POST /users` — body: `fullName`, `email`, `phone` (split into `phoneCountryCode`/`phoneNo` like
  Students' `parsePhone`), `departmentId?`. Which `scope` the request targets determines the
  server-assigned `role`/`tenantId` — the server never trusts a client-supplied `role` or `tenantId`
  for privilege reasons. `ADMIN` callers may only ever create `scope=tenant` users in their own
  tenant; only `SUPER_ADMIN` may create `scope=platform` users.
- `PATCH /users/:id` — body: `fullName`, `email`, `phone`, `departmentId?`. Same tenant-ownership
  check as the read path — an `ADMIN` can't patch a row outside their `tenantId`, and can never
  touch a `role=SUPER_ADMIN` row.
- `PATCH /users/:id/reset-password` — same pattern as `students.controller.ts`.
- `DELETE /users/:id` — same pattern as `students.controller.ts`.

Tenant isolation (CLAUDE.md hard rule): every query/mutation in this module filters by `tenantId`
except the `scope=platform` path, which instead is gated to `SUPER_ADMIN` only and filters on
`tenantId: null`.

## Frontend components & data flow

- `AdminLayout` (`title="Users"`, `backHref="/admin"`, actions slot with a single "New User" button
  — no "Bulk Register" button).
- Tab bar (rendered only for `SUPER_ADMIN`) drives which `scope`/`tenantId` params the table's
  `load()` fetches with — same debounced-search + `page`/`pageSize` state pattern as
  `AdminStudentsPage`.
- `AdminTable` columns: Full Name, Email Address, Phone Number, Department (Tenant Users tab only —
  renders "—" when unassigned), Status badge. The Platform Admins tab omits the Department column
  entirely (platform admins have no department).
- Create/Edit `Dialog`s: `Input` for Full Name/Email, `PhoneField` for phone (reusing
  `validateStudentForm`'s validation shape), a department `<select>` for the Tenant Users tab only —
  populated from `GET /departments` scoped to whichever tenant is active (the SUPER_ADMIN's tenant
  filter selection, or the ADMIN's own tenant).
- Edit dialog footer: Save / Reset Password / Delete — identical three actions to Students, wired to
  the corresponding new endpoints, using the same `ConfirmDialog`/`ConfirmDeleteDialog` components.

## Error handling & edge cases

- Duplicate email → 409 → inline `Alert` in the create/edit dialog, same as
  `createError`/`editError` handling in `AdminStudentsPage`.
- SUPER_ADMIN's "Tenant Users" tab with no tenant selected: table shows an empty-state message
  ("Select a tenant to view its users") instead of firing an unscoped query.
- Direct navigation to `/admin/users` by a role other than `SUPER_ADMIN`/`ADMIN`: redirect guard,
  same as Students.

## Testing debt note

Per CLAUDE.md's testing-debt guardrail: no `.spec.ts` files exist anywhere yet, including for the
already-shipped Auth/Students modules. When the new `users` module ships, propose `ruflo-testgen`
coverage for it (tenant-isolation and role-scoping are exactly the kind of core logic CLAUDE.md
flags as needing tests), even though this is a pre-existing gap and not unique to this feature.
