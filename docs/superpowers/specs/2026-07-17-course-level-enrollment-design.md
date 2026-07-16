# Course-Level Enrollment — Design

Status: Approved (pending spec review)
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

- `Enrollment.seriesId`: `String` → `String?` (was required, becomes optional)
- `Enrollment.courseId`: new, `String?`, FK → `Course.id`, `onDelete: Cascade`
- `Course.enrollments`: new back-relation, `Enrollment[]` (mirrors `CourseSeries.enrollments`,
  currently missing on `Course`)
- New unique constraints (mirroring the existing series ones): `@@unique([courseId, studentId])`,
  `@@unique([courseId, tenantId])`
- New index: `@@index([courseId])`

Migration goes through `prisma migrate dev` (project hard rule — no hand-written SQL DDL).

## Backend logic

**`EnrollmentsService`**

- New exclusivity check, same shape as the existing `studentId`/`tenantId` XOR check:
  `Boolean(dto.seriesId) === Boolean(dto.courseId)` → `BadRequestException`
  ("Exactly one of seriesId or courseId is required").
- `create()`/`update()` pass `seriesId`/`courseId` straight through; the existing `P2002` catch
  (duplicate enrollment) now also covers the two new unique constraints — no new catch needed.
- `findAll()`'s `include` gains `course: { select: { id, title, startDate, endDate } }` alongside
  the existing `series` select, so the admin table can render whichever is set.

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

**New endpoint** — `GET /courses/admin/list` (`SUPER_ADMIN`-only), mirroring the existing
`GET /course-series` flat-list pattern (no pagination): `CoursesService.findAllFlat()` returns
`{ id, title, startDate, endDate }[]`, ordered by `title`. Not reusing the existing paginated
`GET /courses/admin/all` — fighting pagination just to populate a dropdown isn't worth it.

**DTOs** — `CreateEnrollmentDto`/`UpdateEnrollmentDto`: `seriesId` becomes optional, add optional
`courseId`.

## Frontend (`apps/web/.../admin/enrollments/page.tsx`)

- New `RadioGroup` **"Enroll in: Course Series / Individual Course"** in the Create dialog,
  parallel to the existing "Assign to" toggle. Switching it clears the current series/course
  selection (same pattern as switching Student/Tenant clears `assignId`).
- The `SearchableSelect` beneath it swaps `options` between `seriesOptions` (existing) and a new
  `courseOptions` (from `GET /courses/admin/list`), based on the toggle. Course option labels are
  `"${title} (${formatDateRange(startDate, endDate)})"` — reusing the existing
  `formatDateRange` helper from `@/lib/duration.ts` (same formatting as the Learn page), since
  course titles can repeat across instances and only the date range disambiguates them.
- `validateEnrollmentForm` requires "select a course series **or** individual course" instead of
  always requiring a series.
- **Edit dialog**: enroll-type (Series vs Course) is fixed at creation — same precedent as
  Student/Tenant being locked in Edit. Only the specific series/course value (and Expires At) is
  editable, via the same `SearchableSelect` swapped to whichever type it already is. The read-only
  course display (when type is Course) also shows title + `formatDateRange`.
- **Table**: "Course Series" column renamed to **"Course / Series"**. Renders
  `enrollment.series?.name` or `enrollment.course?.title` + `formatDateRange(...)` (for courses),
  each with a colored badge ("Series" / "Course") next to it — same visual pattern as the existing
  Student/Tenant badges (teal/blue), using a distinct pair of colors.
- `Enrollment` type gains `course: { id: string; title: string; startDate: string | null; endDate:
  string | null } | null`.

## Testing

- One runnable check per non-trivial branch (ponytail requirement): a script/spec exercising the
  new exclusivity validation (seriesId/courseId XOR) and the updated `visibilityWhere` OR-branch,
  at minimum confirming a directly-enrolled standalone course becomes visible to that student while
  staying invisible to a different student.
