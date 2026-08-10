import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertAdminCanAccessUser } from './assert-admin-target';

// This gate is shared by every admin-reads-another-user's-data endpoint (agent-chat admin
// routes, course lesson-views admin route). It's the one place the tenant-enumeration fix and
// the "check runs for both roles" fix live — get it wrong here and every caller inherits the bug.
describe('assertAdminCanAccessUser', () => {
  function buildPrisma(user: { id: string; tenantId: string | null } | null) {
    return { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  }

  it('404s for SUPER_ADMIN when the target user does not exist', async () => {
    const prisma = buildPrisma(null);
    await expect(
      assertAdminCanAccessUser(
        prisma as any,
        { role: Role.SUPER_ADMIN, tenantId: null },
        'missing-user',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('404s for ADMIN when the target user does not exist', async () => {
    const prisma = buildPrisma(null);
    await expect(
      assertAdminCanAccessUser(
        prisma as any,
        { role: Role.ADMIN, tenantId: 'tenant-a' },
        'missing-user',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows ADMIN to access a user in their own tenant', async () => {
    const prisma = buildPrisma({ id: 'user-1', tenantId: 'tenant-a' });
    await expect(
      assertAdminCanAccessUser(
        prisma as any,
        { role: Role.ADMIN, tenantId: 'tenant-a' },
        'user-1',
      ),
    ).resolves.toBeUndefined();
  });

  // Cross-tenant must 404, not 403 — a 403 would tell the ADMIN "this id is a real account,
  // just not yours," letting them enumerate valid ids across tenants by watching 403 vs 404.
  it('404s (not 403) for ADMIN targeting a user in a different tenant', async () => {
    const prisma = buildPrisma({ id: 'user-2', tenantId: 'tenant-b' });
    await expect(
      assertAdminCanAccessUser(
        prisma as any,
        { role: Role.ADMIN, tenantId: 'tenant-a' },
        'user-2',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  // Student rows have tenantId: null — this falls out of the same tenant-mismatch branch as
  // any other cross-tenant target, with no Student-specific code path.
  it('404s for ADMIN targeting a Student (tenantId: null)', async () => {
    const prisma = buildPrisma({ id: 'student-user-1', tenantId: null });
    await expect(
      assertAdminCanAccessUser(
        prisma as any,
        { role: Role.ADMIN, tenantId: 'tenant-a' },
        'student-user-1',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows SUPER_ADMIN to access a user in any tenant, including a Student', async () => {
    const prisma = buildPrisma({ id: 'student-user-1', tenantId: null });
    await expect(
      assertAdminCanAccessUser(
        prisma as any,
        { role: Role.SUPER_ADMIN, tenantId: null },
        'student-user-1',
      ),
    ).resolves.toBeUndefined();
  });
});
