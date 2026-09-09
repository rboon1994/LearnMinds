import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Status } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

function makePrismaMock(user: Record<string, unknown>) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      findUniqueOrThrow: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    },
  };
}

const jwtMock = { sign: jest.fn().mockReturnValue('signed-token') } as any;
const membershipsMock = {
  getMembershipsForUser: jest.fn(),
  getReferralCount: jest.fn(),
} as any;

describe('AuthService.validateUser', () => {
  it("allows login for an INACTIVE account (hasn't changed its initial password yet)", async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    const prisma = makePrismaMock({
      id: 'u1',
      email: 'a@b.com',
      password: hashed,
      status: Status.INACTIVE,
    });
    const svc = new AuthService(prisma as any, jwtMock, membershipsMock);
    const user = await svc.validateUser('a@b.com', 'correct-password');
    expect(user.status).toBe(Status.INACTIVE);
  });

  it('still allows login for an ACTIVE account', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    const prisma = makePrismaMock({
      id: 'u1',
      email: 'a@b.com',
      password: hashed,
      status: Status.ACTIVE,
    });
    const svc = new AuthService(prisma as any, jwtMock, membershipsMock);
    const user = await svc.validateUser('a@b.com', 'correct-password');
    expect(user.status).toBe(Status.ACTIVE);
  });

  it('rejects login for a SUSPENDED account', async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    const prisma = makePrismaMock({
      id: 'u1',
      email: 'a@b.com',
      password: hashed,
      status: Status.SUSPENDED,
    });
    const svc = new AuthService(prisma as any, jwtMock, membershipsMock);
    await expect(
      svc.validateUser('a@b.com', 'correct-password'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('AuthService.changePassword', () => {
  it('sets status to ACTIVE alongside clearing mustChangePassword', async () => {
    const hashed = await bcrypt.hash('old-password', 10);
    const prisma = makePrismaMock({ id: 'u1', password: hashed });
    const svc = new AuthService(prisma as any, jwtMock, membershipsMock);
    await svc.changePassword('u1', 'new-password');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        mustChangePassword: false,
        status: Status.ACTIVE,
      }),
    });
  });
});

describe('AuthService.getProfile', () => {
  function makeProfilePrismaMock() {
    return {
      user: {
        findUniqueOrThrow: jest.fn(),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
  }

  function makeProfileMembershipsMock() {
    return {
      getMembershipsForUser: jest.fn().mockResolvedValue([]),
      getReferralCount: jest.fn().mockResolvedValue(0),
    };
  }

  it('returns memberships, referralCount, and commission fields as plain numbers', async () => {
    const prisma = makeProfilePrismaMock();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      fullName: 'Jane Tan',
      email: 'jane@example.com',
      studentId: null,
      referralCode: 'MBR001',
      pendingCommission: { toNumber: () => 50 },
      approvedCommission: { toNumber: () => 100 },
      totalCommission: { toNumber: () => 150 },
    });
    const memberships = makeProfileMembershipsMock();
    memberships.getReferralCount.mockResolvedValue(2);
    const svc = new AuthService(prisma as any, {} as any, memberships as any);

    const profile = await svc.getProfile('user-1');

    expect(profile).toEqual(
      expect.objectContaining({
        fullName: 'Jane Tan',
        email: 'jane@example.com',
        referralCode: 'MBR001',
        referralCount: 2,
        pendingCommission: 50,
        approvedCommission: 100,
        totalCommission: 150,
        memberships: [],
        enrollments: [],
      }),
    );
  });

  it('does not query enrollments for a User with no studentId', async () => {
    const prisma = makeProfilePrismaMock();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      fullName: 'Ali',
      email: 'ali@example.com',
      studentId: null,
      referralCode: null,
      pendingCommission: { toNumber: () => 0 },
      approvedCommission: { toNumber: () => 0 },
      totalCommission: { toNumber: () => 0 },
    });
    const memberships = makeProfileMembershipsMock();
    const svc = new AuthService(prisma as any, {} as any, memberships as any);

    await svc.getProfile('user-2');

    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });
});
