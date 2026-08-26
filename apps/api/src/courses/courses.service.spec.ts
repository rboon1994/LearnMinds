import { ContentStatus, Role } from '@prisma/client';
import { CoursesService } from './courses.service';

// Tenant-scoping is the highest-risk logic in this module: an ADMIN must never read/write
// another tenant's course, and a USER must never see DRAFT or another tenant's content.
describe('CoursesService tenant scoping', () => {
  const admin = {
    userId: 'admin-1',
    tenantId: 'tenant-a',
    studentId: null,
    role: Role.ADMIN,
  };
  const superAdmin = {
    userId: 'super-1',
    tenantId: null,
    studentId: null,
    role: Role.SUPER_ADMIN,
  };
  const user = {
    userId: 'user-1',
    tenantId: 'tenant-a',
    studentId: null,
    role: Role.USER,
  };
  const student = {
    userId: 'student-user-1',
    tenantId: null,
    studentId: 'student-1',
    role: Role.STUDENT,
  };

  function buildService() {
    const prisma = {
      course: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        findFirstOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // findBrowsable separately queries the actor's live enrollments to compute a per-course
      // `isEnrolled` flag (Student via studentId, Tenant/Admin/User via tenantId).
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CoursesService(prisma as any);
    return { service, prisma };
  }

  it('findAllForAdmin scopes findMany to the admin tenant only', () => {
    const { service, prisma } = buildService();
    service.findAllForAdmin('tenant-a', { page: 1, pageSize: 10 });
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
  });

  it('findAllForSuperAdmin does not filter by tenant', () => {
    const { service, prisma } = buildService();
    service.findAllForSuperAdmin({ page: 1, pageSize: 10 });
    const args = prisma.course.findMany.mock.calls[0][0];
    expect(args.where).toEqual({});
  });

  // Tenants no longer own courses at all (policy: only Super Admin creates/uploads courses;
  // Tenant members can only see courses a Super Admin has explicitly enrolled them into) — so
  // findBrowsable's base query is now identical for USER/ADMIN: global (tenantId: null) +
  // PUBLISHED only, with per-course access instead reflected via the separate `isEnrolled` flag
  // below, not by excluding rows from this query.
  it('findBrowsable scopes a USER to global PUBLISHED courses', () => {
    const { service, prisma } = buildService();
    service.findBrowsable(user);
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: null, status: ContentStatus.PUBLISHED },
      }),
    );
  });

  it('findBrowsable scopes an ADMIN to the same global PUBLISHED courses as a USER', () => {
    const { service, prisma } = buildService();
    service.findBrowsable(admin);
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: null, status: ContentStatus.PUBLISHED },
      }),
    );
  });

  // Regression test: findBrowsable used to always filter to PUBLISHED regardless of role,
  // hiding drafts from Super Admin on the /learn page even though they should see everything.
  // Still global-only (tenantId: null) even for Super Admin — this method only ever browses the
  // platform-wide course catalog, not any tenant's content.
  it('findBrowsable is unrestricted by status (including drafts) but still global-only for a Super Admin', () => {
    const { service, prisma } = buildService();
    service.findBrowsable(superAdmin);
    const args = prisma.course.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ tenantId: null });
  });

  // A directly-enrolled standalone course must be flagged enrolled for a Student independent of
  // whether that course's series (if any) is separately enrolled — the OR-branch added alongside
  // course-level enrollment, now expressed as the `isEnrolled` flag rather than row exclusion.
  it('findBrowsable flags a course as enrolled via either its series or a direct enrollment', async () => {
    const { service, prisma } = buildService();
    prisma.course.findMany.mockResolvedValue([
      { id: 'course-1', seriesId: null },
      { id: 'course-2', seriesId: 'series-1' },
      { id: 'course-3', seriesId: null },
    ]);
    prisma.enrollment.findMany.mockResolvedValue([
      { seriesId: null, courseId: 'course-1' },
      { seriesId: 'series-1', courseId: null },
    ]);
    const result = await service.findBrowsable(student);
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: 'student-1' }),
      }),
    );
    expect(result.find((c) => c.id === 'course-1')!.isEnrolled).toBe(true);
    expect(result.find((c) => c.id === 'course-2')!.isEnrolled).toBe(true);
    expect(result.find((c) => c.id === 'course-3')!.isEnrolled).toBe(false);
  });

  it('create assigns the admin actor tenantId to the course', async () => {
    const { service, prisma } = buildService();
    prisma.course.create.mockResolvedValue({});
    await service.create({ title: 'x' }, admin);
    expect(prisma.course.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          createdById: 'admin-1',
        }),
      }),
    );
  });

  it('create assigns tenantId null (global) for a Super Admin actor', async () => {
    const { service, prisma } = buildService();
    prisma.course.create.mockResolvedValue({});
    await service.create({ title: 'x' }, superAdmin);
    expect(prisma.course.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: null,
          createdById: 'super-1',
        }),
      }),
    );
  });

  it('assertManageable scopes lookup by tenantId for an Admin actor', async () => {
    const { service, prisma } = buildService();
    prisma.course.findFirstOrThrow.mockResolvedValue({ id: 'course-1' });
    await service.assertManageable('course-1', admin);
    expect(prisma.course.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'course-1', tenantId: 'tenant-a' },
    });
  });

  it('assertManageable is unrestricted for a Super Admin actor', async () => {
    const { service, prisma } = buildService();
    prisma.course.findFirstOrThrow.mockResolvedValue({ id: 'course-1' });
    await service.assertManageable('course-1', superAdmin);
    expect(prisma.course.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'course-1' },
    });
  });

  it('update rejects (via findFirstOrThrow scoping) a course outside the admin tenant', async () => {
    const { service, prisma } = buildService();
    prisma.course.findFirstOrThrow.mockRejectedValue(
      new Error('Record not found'),
    );
    await expect(
      service.update('other-tenant-course', {}, admin),
    ).rejects.toThrow('Record not found');
    expect(prisma.course.update).not.toHaveBeenCalled();
    expect(prisma.course.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'other-tenant-course', tenantId: 'tenant-a' },
    });
  });

  it('findOne scopes a USER to PUBLISHED + own-tenant-or-global', async () => {
    const { service, prisma } = buildService();
    prisma.course.findFirstOrThrow.mockResolvedValue({ id: 'course-1' });
    await service.findOne('course-1', user);
    expect(prisma.course.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'course-1',
          status: ContentStatus.PUBLISHED,
          OR: [{ tenantId: 'tenant-a' }, { tenantId: null }],
        },
      }),
    );
  });

  it('findOne scopes an ADMIN to their own tenant regardless of status', async () => {
    const { service, prisma } = buildService();
    prisma.course.findFirstOrThrow.mockResolvedValue({ id: 'course-1' });
    await service.findOne('course-1', admin);
    expect(prisma.course.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'course-1', tenantId: 'tenant-a' },
      }),
    );
  });

  it('findOne is unrestricted for a Super Admin', async () => {
    const { service, prisma } = buildService();
    prisma.course.findFirstOrThrow.mockResolvedValue({ id: 'course-1' });
    await service.findOne('course-1', superAdmin);
    expect(prisma.course.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'course-1' } }),
    );
  });
});

// findLessonViewsForUserAsAdmin: tenant/existence gating is the caller's responsibility (see
// assertAdminCanAccessUser's own tests) — this covers the query shape it's relied on for.
describe('CoursesService.findLessonViewsForUserAsAdmin', () => {
  function buildService() {
    const prisma = {
      lessonView: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new CoursesService(prisma as any);
    return { service, prisma };
  }

  it('scopes to the target userId and orders by most-recently-viewed', async () => {
    const { service, prisma } = buildService();
    await service.findLessonViewsForUserAsAdmin('user-1', {
      page: 1,
      pageSize: 10,
    });
    const args = prisma.lessonView.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'user-1' });
    expect(args.orderBy).toEqual({ lastViewedAt: 'desc' });
  });

  // A bare `include` on lesson/course would drag along every Course field (description,
  // thumbnail, whatsapp fields, etc.) on every one of a user's lesson-view rows — this asserts
  // the explicit `select` stays narrow to just the display fields.
  it('uses an explicit select on lesson/course, not a bare include', async () => {
    const { service, prisma } = buildService();
    await service.findLessonViewsForUserAsAdmin('user-1', {
      page: 1,
      pageSize: 10,
    });
    const args = prisma.lessonView.findMany.mock.calls[0][0];
    expect(args.select.lesson.select.course.select).toEqual({
      id: true,
      title: true,
    });
  });
});
