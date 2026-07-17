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
