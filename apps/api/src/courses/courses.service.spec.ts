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
        // findBrowsable/findAllForAdmin etc. all `await` this and (for findBrowsable) call
        // `.map()` on the result — an unmocked jest.fn() resolves to undefined and crashes the
        // whole worker process (pre-existing gap in this file, unrelated to this session's
        // change; only patched enough here to stop the crash, not asserting findBrowsable's
        // current behavior).
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        findFirstOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // findBrowsable also awaits this for every non-SUPER_ADMIN actor with a tenantId/studentId
      // — same pre-existing gap as above.
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

  it('findBrowsable scopes a USER to PUBLISHED courses in their tenant or global', () => {
    const { service, prisma } = buildService();
    service.findBrowsable(user);
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: ContentStatus.PUBLISHED,
          OR: [{ tenantId: 'tenant-a' }, { tenantId: null }],
        },
      }),
    );
  });

  it('findBrowsable scopes an ADMIN to their own tenant regardless of status', () => {
    const { service, prisma } = buildService();
    service.findBrowsable(admin);
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
  });

  // Regression test: findBrowsable used to always filter to PUBLISHED regardless of role,
  // hiding drafts from Super Admin on the /learn page even though they should see everything.
  it('findBrowsable is unrestricted (including drafts) for a Super Admin', () => {
    const { service, prisma } = buildService();
    service.findBrowsable(superAdmin);
    const args = prisma.course.findMany.mock.calls[0][0];
    expect(args.where).toEqual({});
  });

  // A directly-enrolled standalone course must be visible to a Student independent of whether
  // that course's series (if any) is separately enrolled — the OR-branch added alongside
  // course-level enrollment.
  it('findBrowsable makes a directly-enrolled course visible to a Student via either the series or a direct enrollment', () => {
    const { service, prisma } = buildService();
    service.findBrowsable(student);
    const args = prisma.course.findMany.mock.calls[0][0];
    expect(args.where.status).toBe(ContentStatus.PUBLISHED);
    expect(args.where.OR).toHaveLength(2);
    const [seriesBranch, courseBranch] = args.where.OR;
    expect(seriesBranch.series.enrollments.some.studentId).toBe('student-1');
    expect(courseBranch.enrollments.some.studentId).toBe('student-1');
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
