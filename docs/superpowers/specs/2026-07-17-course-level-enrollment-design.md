# Course-Level Enrollment — Design

Status: Approved (2 review rounds applied — cascade explicitness, update() type-lock enforcement,
null-safe date formatting, branch-based validation, DB-level CHECK constraints for both XOR pairs,
verified no Series-container gap on Learn, debounced server-search course picker)
Date: 2026-07-17

## Problem

`Enrollment` currently only grants access at the `CourseSeries` level (`Enrollment.seriesId` is
required). There is no way to enroll a Student (or Tenant) into a single standalone `Course` —
even though `Course.seriesId` is already optional and standalone courses exist. The Student-facing
Learn page's visibility query (`courses.service.ts`'s `visibilityWhere`) documents this limitation
explicitly: *"a course with no series can never be Student-visible."*

## Goal

Admins can enroll a Student or Tenant into either a `CourseSeries` (existing behavior, unchanged)
or a single `Course` (new), independently of whether that course's series is separately enrolled.

## Scope boundary (explicitly out of scope)

Tenant-level enrollment (`Enrollment.tenantId`) currently has **no visibility effect for any
role** — not for Students (structurally impossible: `Student`'s `User.tenantId` is enforced `NULL`
by a DB check constraint, so a Student can never "belong" to a Tenant) and not for `ADMIN`/`USER`
roles either (their visibility branch filters by `Course.tenantId` ownership, never reads
`Enrollment` at all). This is a pre-existing architectural gap, confirmed with the user as **out of
scope** for this change. Tenant + Course enrollment is added at the data/API level for symmetry
with Tenant + Series (both already share this same no-op-for-visibility characteristic today), but
neither will gate anyone's access until that separate gap is addressed.

## Data model changes

`schema.prisma`:

- `Enrollment.seriesId`: `String` → `String?` (was required, becomes optional). The relation line
  must **explicitly restate** `onDelete: Cascade` (`series CourseSeries? @relation(fields:
  [seriesId], references: [id], onDelete: Cascade)`) — not left to Prisma's default. Making a
  scalar optional does not itself change the FK's referential action, but Prisma's *default*
  action differs between required and optional relations when unspecified; since the current
  schema already declares `onDelete: Cascade` explicitly, the rewritten line must keep declaring it
  explicitly too, or the migration could silently emit `SetNull` instead.
- `Enrollment.courseId`: new, `String?`, FK → `Course.id`, `onDelete: Cascade` (same explicit
  declaration).
- `Course.enrollments`: new back-relation, `Enrollment[]` (mirrors `CourseSeries.enrollments`,
  currently missing on `Course`)
- New unique constraints (mirroring the existing series ones): `@@unique([courseId, studentId])`,
  `@@unique([courseId, tenantId])`
- New index: `@@index([courseId])`

Migration goes through `prisma migrate dev` (project hard rule — no hand-written SQL DDL for
*creating* schema objects). One exception, using the same sanctioned pattern already established in
this codebase (`migrations/20260715061456_relax_student_tenant_constraint` hand-adds a `CHECK`
constraint via `prisma migrate dev --create-only`, since Prisma's schema DSL cannot express `CHECK`
constraints natively): the application-layer XOR validation in `EnrollmentsService` (both the
existing `studentId`/`tenantId` exclusivity and the new `seriesId`/`courseId` one) has never had a
DB-level backstop — a script or future caller going through `prisma.enrollment.create()` directly,
bypassing the service, could still write invalid rows. Since we're already migrating this table,
add both as real constraints in the same migration:

```sql
ALTER TABLE "Enrollment" ADD CONSTRAINT chk_enrollment_assignee
  CHECK (("studentId" IS NOT NULL) <> ("tenantId" IS NOT NULL));
ALTER TABLE "Enrollment" ADD CONSTRAINT chk_enrollment_target
  CHECK (("seriesId" IS NOT NULL) <> ("courseId" IS NOT NULL));
```

This closes the pre-existing `studentId`/`tenantId` gap for free while we're here, not just the new
one.

## Backend logic

**`EnrollmentsService`** (already refactored to paginated `findAll(query: EnrollmentsQueryDto)` using
the shared `paginate()` helper + `enrollmentInclude`, ahead of this feature)

- New exclusivity check on `create()`, same shape as the existing `studentId`/`tenantId` XOR check:
  `Boolean(dto.seriesId) === Boolean(dto.courseId)` → `BadRequestException`
  ("Exactly one of seriesId or courseId is required").
- **`update()` must not trust the frontend's type lock.** The Edit dialog UI prevents switching an
  enrollment between Series and Course, but that's a UI affordance, not enforcement — a direct API
  call could still flip it. `update()` loads the existing enrollment first and rejects (with
  `BadRequestException`) any `dto` that targets the field the enrollment *doesn't* currently use
  (e.g. an enrollment with `seriesId` set must reject a `dto.courseId`, and vice versa) — defense in
  depth, not just client-side. This check (and the `create()` XOR check) must treat an explicitly
  sent `null` the same as an omitted field — some form libraries send inactive fields as `null`
  rather than leaving them out (e.g. `{ seriesId: "123", courseId: null }`). `Boolean(x)` already
  does this correctly (`Boolean(null) === Boolean(undefined) === false`), so use that same loose
  style consistently — never a strict `dto.courseId !== undefined` check, which would misfire on an
  explicit `null`.
- `create()`/`update()` pass `seriesId`/`courseId` straight through; the existing `P2002` catch
  (duplicate enrollment) now also covers the two new unique constraints — no new catch needed.
- `enrollmentInclude` gains `course: { select: { id, title, startDate, endDate } }` alongside the
  existing `series` select, so the admin table can render whichever is set. This adds one more
  optional join to an already-paginated query — no new performance concern (the `GET /enrollments`
  unpaginated-full-scan issue was separately already fixed server- and client-side, ahead of this
  feature, via `EnrollmentsQueryDto` + `paginate()` on the backend and debounced server-side
  search/pagination in `enrollments/page.tsx`).

**`CoursesService.visibilityWhere` (STUDENT branch)**

Add an `OR` branch so a course is visible if either its series has a matching enrollment (existing)
or the course itself has a direct one (new):

```ts
if (actor.role === Role.STUDENT) {
  const now = new Date();
  const notExpired = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  return {
    status: ContentStatus.PUBLISHED,
    OR: [
      { series: { enrollments: { some: { studentId: actor.studentId, ...notExpired } } } },
      { enrollments: { some: { studentId: actor.studentId, ...notExpired } } },
    ],
  };
}
```

Tenant-side (`tenantId`) is intentionally not added here — see Scope boundary above.

**Verified: no separate "Series container" to gate.** Checked the current Learn page
(`apps/web/src/app/learn/page.tsx`) directly — it's a flat Course grid (`GET /courses`, cards
linking straight to `/learn/${course.id}`), not a Series-grouped view; grepping
`apps/web/src/app/learn/` for `series`/`seriesId` returns nothing. So a directly-enrolled standalone
course has no separate Series-level visibility gate to clear — the `visibilityWhere` change above
is sufficient on its own, confirmed against the real code rather than assumed.

**New endpoint** — `GET /courses/admin/list` (`SUPER_ADMIN`-only, same `RolesGuard` class-level
guard as the rest of `EnrollmentsController`/`CoursesController`'s admin routes — enrolling a
Student or Tenant remains exclusively a Super Admin action, unchanged by this feature). Reuses the existing
`CoursesQueryDto` (already has `search`/`page`/`pageSize`) and the shared `paginate()` helper,
selecting only `{ id, title, startDate, endDate }`, ordered by `title` — same paginated shape as
`GET /students`/`GET /enrollments`. Unlike the Student picker (which prefetches everything with a
large `pageSize` — an existing, separate decision, not touched here), the Course picker debounces
and re-queries this endpoint server-side as the admin types (see Frontend section) — a course
catalog can grow large over years of content, and course entries need a more expensive per-row
disambiguation (title + date range) than a one-line student name/email, so prefetching everything
doesn't scale the same way.

**DTOs** — `CreateEnrollmentDto`/`UpdateEnrollmentDto`: `seriesId` becomes optional, add optional
`courseId`.

## Frontend (`apps/web/.../admin/enrollments/page.tsx`)

- New `RadioGroup` **"Enroll in: Course Series / Individual Course"** in the Create dialog,
  parallel to the existing "Assign to" toggle. Switching it clears the current series/course
  selection (same pattern as switching Student/Tenant clears `assignId`).
- `SearchableSelect` gains one new optional prop, `onQueryChange?: (query: string) => void`,
  fired alongside its existing internal `setQuery` in the input's `onChange` — purely additive,
  opt-in, doesn't touch behavior for its 5 existing consumers (`enrollments`, `courses` admin
  pages ×2, `learn` page) since none pass it today.
- The `SearchableSelect` beneath the new toggle swaps `options` between `seriesOptions` (existing,
  unpaginated small list, unchanged) and a new `courseOptions`, based on the toggle. `courseOptions`
  is populated by debouncing `onQueryChange` (same `setTimeout`-based debounce already used for the
  main table's `debouncedSearch` in this file) into `GET /courses/admin/list?search=...`, re-fetching
  as the admin types — not a one-shot large-`pageSize` prefetch. Course option labels are
  `"${title} (${formatDateRange(startDate, endDate)})"` — reusing the existing
  `formatDateRange` helper from `@/lib/duration.ts` (same formatting as the Learn page), since
  course titles can repeat across instances and only the date range disambiguates them.
  `formatDateRange` already returns `null` gracefully for a null `startDate` (verified — no crash
  risk), but every new call site here must handle that `null` explicitly: when it returns `null`,
  render just the title with no trailing `" ()"` — the date segment is omitted entirely, not shown
  empty.
- `validateEnrollmentForm` branches on the current `assignContentType` ('SERIES' | 'COURSE')
  radio selection and requires whichever field that type expects (`assignSeriesId` or
  `assignCourseId`) — not a flat "both empty" check. The two are functionally equivalent given the
  state machine (the inactive field is never populated), but branching on the explicit radio state
  is clearer and doesn't rely on that invariant holding.
- **Edit dialog**: enroll-type (Series vs Course) is fixed at creation — same precedent as
  Student/Tenant being locked in Edit, now also enforced server-side (see `update()` above). Only
  the specific series/course value (and Expires At) is editable, via the same `SearchableSelect`
  swapped to whichever type it already is. The read-only course display (when type is Course) also
  shows title + `formatDateRange`, with the same null-omission handling.
- **Table**: "Course Series" column renamed to **"Course / Series"**. Renders
  `enrollment.series?.name` or `enrollment.course?.title` + `formatDateRange(...)` (for courses,
  omitted when null), each with a colored badge ("Series" / "Course") next to it — same visual
  pattern as the existing Student/Tenant badges (teal/blue), using a distinct pair of colors.
- `Enrollment` type gains `course: { id: string; title: string; startDate: string | null; endDate:
  string | null } | null`.

## Testing

- One runnable check per non-trivial branch (ponytail requirement): a script/spec exercising the
  new exclusivity validation (seriesId/courseId XOR) and the updated `visibilityWhere` OR-branch,
  at minimum confirming a directly-enrolled standalone course becomes visible to that student while
  staying invisible to a different student.
- A check for `update()`'s server-side type-lock: a `PATCH` on a series-based enrollment carrying
  `courseId` (or vice versa) must be rejected, not silently accepted.
- A check that the two new DB-level `CHECK` constraints actually reject bad rows when written via
  `prisma.enrollment.create()` directly (bypassing `EnrollmentsService`) — e.g. both `seriesId` and
  `courseId` null, or both set — confirming the constraint fires, not just that the SQL applied
  cleanly during migration.
