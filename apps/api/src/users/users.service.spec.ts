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
    await svc.findAll(
      { scope: UserScope.TENANT, page: 1, pageSize: 10 },
      'tenant-a',
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: Role.USER,
          tenantId: 'tenant-a',
        }),
      }),
    );
  });

  it('findAll scopes the Platform Admins list to SUPER_ADMIN + ADMIN across every tenant, ignoring the tenantId param', async () => {
    const prisma = makePrismaMock();
    const svc = new UsersService(prisma as any);
    await svc.findAll(
      { scope: UserScope.PLATFORM, page: 1, pageSize: 10 },
      'tenant-a',
    );
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.role).toEqual({ in: [Role.SUPER_ADMIN, Role.ADMIN] });
    expect(where).not.toHaveProperty('tenantId');
  });

  it('update rejects a row outside the ADMIN scope tenant before writing anything', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirstOrThrow.mockRejectedValue(new Error('not found'));
    const svc = new UsersService(prisma as any);
    await expect(
      svc.update(
        'user-1',
        { fullName: 'New Name' },
        { role: Role.USER, tenantId: 'tenant-a' },
      ),
    ).rejects.toThrow('not found');
    expect(prisma.user.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'user-1', role: Role.USER, tenantId: 'tenant-a' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('suspend for SUPER_ADMIN (scope=null) allows role=USER, role=SUPER_ADMIN, or role=ADMIN, never STUDENT', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirstOrThrow.mockResolvedValue({
      id: 'user-1',
      tenantId: null,
    });
    prisma.user.update.mockResolvedValue({ id: 'user-1', status: 'SUSPENDED' });
    const svc = new UsersService(prisma as any);
    await svc.suspend('user-1', null);
    expect(prisma.user.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        role: { in: [Role.USER, Role.SUPER_ADMIN, Role.ADMIN] },
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { status: 'SUSPENDED' },
      }),
    );
  });

  it('suspend rejects a row outside the ADMIN scope tenant before writing anything', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirstOrThrow.mockRejectedValue(new Error('not found'));
    const svc = new UsersService(prisma as any);
    await expect(
      svc.suspend('user-1', { role: Role.USER, tenantId: 'tenant-a' }),
    ).rejects.toThrow('not found');
    expect(prisma.user.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'user-1', role: Role.USER, tenantId: 'tenant-a' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('create rejects a departmentId that does not belong to the resolved tenant', async () => {
    const prisma = makePrismaMock();
    prisma.department.findFirstOrThrow.mockRejectedValue(
      new Error('not found'),
    );
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

  it('update does not persist departmentId on a Platform Admin row (role=SUPER_ADMIN, tenantId=null)', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirstOrThrow.mockResolvedValue({
      id: 'admin-1',
      role: Role.SUPER_ADMIN,
      tenantId: null,
    });
    prisma.user.update.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      fullName: 'Updated Admin',
      role: Role.SUPER_ADMIN,
      tenantId: null,
      departmentId: null,
    });

    const svc = new UsersService(prisma as any);
    await svc.update(
      'admin-1',
      { fullName: 'Updated Admin', departmentId: 'dept-x' },
      null,
    );

    // Should NOT have called department validation
    expect(prisma.department.findFirstOrThrow).not.toHaveBeenCalled();

    // Should have called update with the right shape
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: expect.objectContaining({ fullName: 'Updated Admin' }),
      select: expect.anything(),
    });

    // Verify departmentId is NOT in the data object
    const updateCallData = prisma.user.update.mock.calls[0][0].data;
    expect(updateCallData).not.toHaveProperty('departmentId');
  });

  it('create sets status: INACTIVE on a new row', async () => {
    const prisma = makePrismaMock();
    prisma.user.create.mockResolvedValue({ id: 'user-1', status: 'INACTIVE' });
    const svc = new UsersService(prisma as any);
    await svc.create(
      {
        scope: UserScope.PLATFORM,
        fullName: 'Jane',
        email: 'jane@example.com',
      },
      null,
    );
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'INACTIVE' }),
      }),
    );
  });

  it('resetPassword sets status back to INACTIVE', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirstOrThrow.mockResolvedValue({
      id: 'user-1',
      role: Role.USER,
      tenantId: 'tenant-a',
    });
    prisma.user.update.mockResolvedValue({ id: 'user-1', status: 'INACTIVE' });
    const svc = new UsersService(prisma as any);
    await svc.resetPassword('user-1', {
      role: Role.USER,
      tenantId: 'tenant-a',
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mustChangePassword: true,
          status: 'INACTIVE',
        }),
      }),
    );
  });
});
