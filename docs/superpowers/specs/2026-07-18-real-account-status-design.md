# Real Account Status (INACTIVE-until-password-changed) — Design

Status: Approved (clarified: global auth semantic change across all roles; Students migrated to
the same mechanism instead of keeping its derived-display-only trick)
Date: 2026-07-18

## Problem

Both the Students admin table and the newly-built Users admin table show a "Status" badge meant to
tell an admin whether an account has actually been used yet. Today the two pages disagree on what
that badge even means, and neither reflects the real, enforced account state:

- **Students** (`students.service.ts`'s `toStudentDto`): ignores the real `User.status` Prisma
  column entirely and fakes a badge from `mustChangePassword` (`INACTIVE` until the Student
  changes their bulk-register temp password, `ACTIVE` after). The real `status` column sits
  unused at its schema default (`ACTIVE`) forever.
- **Users** (`users.service.ts`, shipped in the prior plan): selects and returns the real `status`
  column as-is. But nothing ever sets it to anything other than the schema default `ACTIVE`, so
  every newly created User or password-reset User shows `ACTIVE` immediately — the opposite of
  the intended signal.

Separately, `User.status` is not a decorative column: `auth.service.ts:24-25`'s `validateUser()`
actively blocks login for any non-`ACTIVE` status (`ForbiddenException('Account is not active')`).
This is why Students/Users have never been created with a real `INACTIVE` status before now — doing
so under the *current* enforcement would lock the account out of logging in at all, including
reaching the Change Password screen that's supposed to unlock it.

## Goal

Make the Status column mean the same, real thing everywhere: **`INACTIVE`** = the account has never
changed its initial (bulk-register / admin-created / password-reset) temp password;
**`ACTIVE`** = it has. A `SUPER_ADMIN`/`ADMIN` looking at either table sees genuine account state,
not a proxy. Achieve this by making `INACTIVE` a real, storable, login-permitting status instead of
a derived display value.

## Scope boundary (explicitly confirmed with the user)

- This is a **global** semantic change to the `Status` enum's enforcement, not a Users-only patch —
  it applies to every role that authenticates through `auth.service.ts` (Students, Users, Admins).
- **Students is migrated to the same real-column mechanism** in this same change, replacing its
  `toStudentDto` derived-status trick, so both admin tables share one implementation instead of two
  divergent ones.
- **No new UI for setting `SUSPENDED`** is added — this spec only changes what already exists
  (`INACTIVE` no longer blocks login; `SUSPENDED` now does). Actually suspending an account remains
  out of scope, same as today.
- The self-serve organization signup flow (`auth.service.ts`'s `register()`) is unaffected: those
  users set their own password at signup, so `mustChangePassword` is never `true` for them and
  `status` correctly stays at its schema default `ACTIVE` — no code path in this spec touches it.

## Semantic change

| Status | Before this change | After this change |
|---|---|---|
| `ACTIVE` | Can log in | Can log in (unchanged) |
| `INACTIVE` | **Cannot log in** (blocked by `validateUser`) | **Can log in** — signals "hasn't changed initial password yet"; frontend's existing `mustChangePassword` redirect sends them to Change Password |
| `SUSPENDED` | Cannot log in | Cannot log in (unchanged; this status now becomes the actual enforcement gate) |

## Changes by file

### `apps/api/src/auth/auth.service.ts`

- `validateUser()` (currently line 24-25): change the blocking condition from
  `if (user.status !== Status.ACTIVE)` to `if (user.status === Status.SUSPENDED)`. Every other line
  in this method (email lookup, password comparison, error messages/types) stays unchanged — this is
  a one-condition change to the existing check, not a rewrite.
- `changePassword(userId, newPassword)` (currently sets `data: { password: hashed,
  mustChangePassword: false }`): add `status: Status.ACTIVE` to that same `data` object, so
  completing a password change is the one moment an account's real status flips from `INACTIVE`
  to `ACTIVE`.

### `apps/api/src/students/students.service.ts`

- `bulkRegister()`: the `tx.user.create({ data: { ... } })` call already sets
  `mustChangePassword: true`; add `status: Status.INACTIVE` alongside it.
- `resetPassword()`: the `prisma.user.update({ data: { password: hashed, mustChangePassword: true
  } })` call; add `status: Status.INACTIVE` alongside it (matches the "Reset Password also goes
  back to Inactive" requirement from the original request).
- `toStudentDto()`: delete this helper entirely — `selectFields` already includes `status`, and it
  is now the real, meaningful value; both `findAll`/`findOne`/`update`/`delete`/`resetPassword`
  return the raw row from `selectFields` without the derived-status remapping.
- `mustChangePassword` can be dropped from `selectFields` if nothing else in this service reads it
  post-removal of `toStudentDto` (verify at implementation time — keep it if any other call site
  still needs it, e.g. a per-row conditional elsewhere).

### `apps/api/src/users/users.service.ts`

- `create()`: the `prisma.user.create({ data: { ..., mustChangePassword: true } })` call; add
  `status: Status.INACTIVE` alongside it.
- `resetPassword()`: the `prisma.user.update({ data: { password: hashed, mustChangePassword: true }
  })` call; add `status: Status.INACTIVE` alongside it.
- `findAll`/`update`/`delete` need no change — they already select/return the real `status` column
  untouched; it will now simply carry meaningful values instead of always being `ACTIVE`.

### Frontend — `apps/web/src/app/admin/students/page.tsx`

- The `Student` type's `status` field and the inline badge-class lookup already exist for
  `'ACTIVE' | 'INACTIVE'` — add the `'SUSPENDED'` variant (red badge, matching the color Users'
  page already uses: `bg-red-100 text-red-700`) purely for forward consistency with the real enum,
  even though nothing in this spec creates a `SUSPENDED` row today.

### Frontend — `apps/web/src/app/admin/users/page.tsx`

- No change needed — it already types `status` as `'ACTIVE' | 'INACTIVE' | 'SUSPENDED'` and renders
  all three badge colors; it was already ahead of Students on this axis, and its badge will now
  simply reflect real, meaningful values instead of always-`ACTIVE`.

## Security note

This change relaxes an authentication trust-boundary check
(`auth.service.ts:validateUser`). Per this repo's hard rule, it requires a `security-review` pass
before shipping — specifically re-verifying: (1) `SUSPENDED` still fully blocks login exactly as
`ACTIVE`-only enforcement did before for that state, (2) no code path anywhere else in the codebase
currently depends on `INACTIVE` meaning "blocked" (grep for other `Status`/`.status` reads before
implementing), and (3) the relaxed check doesn't change behavior for the self-serve `register()`
flow (it shouldn't — those accounts are created at `ACTIVE` and never touch `mustChangePassword`).

## Testing

`apps/api/src/auth` currently has no `.spec.ts` file for `AuthService` (per this repo's known
testing-debt gap). Since this change touches the login trust boundary, add focused unit tests for
`validateUser()` (`INACTIVE` now succeeds past the status gate; `SUSPENDED` still throws
`ForbiddenException`; `ACTIVE` still succeeds — following the existing lightweight mock style used
in `roles.guard.spec.ts` / `users.service.spec.ts`, no NestJS TestingModule needed) and for
`changePassword()` (asserts the Prisma update call includes `status: Status.ACTIVE`). This is new,
not a pre-existing gap being left alone — the plan should not skip it.
