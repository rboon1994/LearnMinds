import 'reflect-metadata';
import { MembershipStatus } from '@prisma/client';
import { MembershipsService } from './memberships.service';

function makePrismaMock() {
  return {
    membership: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn(),
  };
}

describe('MembershipsService', () => {
  it('closeExpiredMemberships flips past-endDate ACTIVE rows to EXPIRED', async () => {
    const prisma = makePrismaMock();
    const svc = new MembershipsService(prisma as any);
    await svc.closeExpiredMemberships();
    expect(prisma.membership.updateMany).toHaveBeenCalledWith({
      where: { endDate: { lt: expect.any(Date) }, status: MembershipStatus.ACTIVE },
      data: { status: MembershipStatus.EXPIRED },
    });
  });

  it('closeExpiredMemberships throttles repeated calls within the window', async () => {
    const prisma = makePrismaMock();
    const svc = new MembershipsService(prisma as any);
    await svc.closeExpiredMemberships();
    await svc.closeExpiredMemberships();
    expect(prisma.membership.updateMany).toHaveBeenCalledTimes(1);
  });

  it('getMembershipsForUser converts Decimal amount to a plain number', async () => {
    const prisma = makePrismaMock();
    prisma.membership.findMany.mockResolvedValue([
      {
        id: 'm1',
        tier: '10K Silver',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2027-01-01'),
        amount: { toNumber: () => 1000 },
        status: MembershipStatus.ACTIVE,
        createdAt: new Date('2026-01-01'),
      },
    ]);
    const svc = new MembershipsService(prisma as any);
    const result = await svc.getMembershipsForUser('user-1');
    expect(result).toEqual([
      expect.objectContaining({ id: 'm1', amount: 1000 }),
    ]);
    expect(typeof result[0].amount).toBe('number');
  });

  it('getReferralCount runs a raw COUNT(DISTINCT) query and returns its number', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ count: 3 }]);
    const svc = new MembershipsService(prisma as any);
    const count = await svc.getReferralCount('user-1');
    expect(count).toBe(3);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});
