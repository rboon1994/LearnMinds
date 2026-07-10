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

  function buildService() {
    const prisma = {
      course: {
        findMany: jest.fn(),
        findFirstOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const service = new CoursesService(prisma as any);
    return { service, prisma };
  }

  it('findAllForAdmin scopes findMany to the admin tenant only', () => {
    const { service, prisma } = buildService();
    service.findAllForAdmin('tenant-a');
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
  });

  it('findAllForSuperAdmin does not filter by tenant', () => {
    const { service, prisma } = buildService();
    service.findAllForSuperAdmin();
    const args = prisma.course.findMany.mock.calls[0][0];
    expect(args.where).toBeUndefined();
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
