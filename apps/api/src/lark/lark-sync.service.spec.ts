import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { MembershipStatus, Prisma, Role, Status } from '@prisma/client';
import { LarkSyncService } from './lark-sync.service';
import type { LarkMembershipRecordDto } from './dto/lark-membership-record.dto';

function baseRecord(
  overrides: Partial<LarkMembershipRecordDto> = {},
): LarkMembershipRecordDto {
  return {
    larkRecordId: 'rec1',
    fullName: 'Jane Tan',
    email: 'jane@example.com',
    tier: '10K Silver',
    status: '生效中',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    amount: 1000,
    pendingCommission: 0,
    approvedCommission: 0,
    totalCommission: 0,
    ...overrides,
  };
}

function makePrismaMock() {
  return {
    membership: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest
        .fn()
        .mockImplementation(({ create }: any) => ({ id: 'm1', ...create })),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    student: { create: jest.fn().mockResolvedValue({ id: 'student-1' }) },
    $transaction: jest.fn(),
  };
}

describe('LarkSyncService.syncRecord', () => {
  it('creates a new User + Student + PENDING Membership for a brand-new email', async () => {
    const prisma = makePrismaMock();
    const createSpy = jest
      .fn()
      .mockResolvedValue({ id: 'user-1', email: 'jane@example.com' });
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        student: { create: jest.fn().mockResolvedValue({ id: 'student-1' }) },
        user: { create: createSpy },
      }),
    );
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      commissionSyncedAt: null,
    });
    const svc = new LarkSyncService(prisma as any);

    await svc.syncRecord(baseRecord({ status: '待启用' }));

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: Role.STUDENT,
          mustChangePassword: true,
          status: Status.INACTIVE,
        }),
      }),
    );
    expect(prisma.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: MembershipStatus.PENDING }),
      }),
    );
  });

  it('does not create anything for a never-seen larkRecordId reported as 非会员', async () => {
    const prisma = makePrismaMock();
    const svc = new LarkSyncService(prisma as any);

    const result = await svc.syncRecord(
      baseRecord({ tier: '非会员', status: '待启用' }),
    );

    expect(result).toBeNull();
    expect(prisma.membership.upsert).not.toHaveBeenCalled();
  });

  it('reuses the existing User for an already-registered email (any Role)', async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      commissionSyncedAt: null,
    });
    const svc = new LarkSyncService(prisma as any);

    await svc.syncRecord(baseRecord());

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        fullName: 'Jane Tan',
        phoneCountryCode: undefined,
        phoneNo: undefined,
      },
    });
  });

  it('for an already-bound larkRecordId, uses the known userId and does not re-resolve by email', async () => {
    const prisma = makePrismaMock();
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'user-1',
      larkUpdatedAt: null,
      referredByUserId: null,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      commissionSyncedAt: null,
    });
    const svc = new LarkSyncService(prisma as any);

    await svc.syncRecord(baseRecord());

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { larkRecordId: 'rec1' } }),
    );
  });

  it("updates the known User's basic info (including email) when not stale, and throws 409 on a collision", async () => {
    const prisma = makePrismaMock();
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'user-1',
      larkUpdatedAt: null,
      referredByUserId: null,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      commissionSyncedAt: null,
    });
    prisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    const svc = new LarkSyncService(prisma as any);

    await expect(
      svc.syncRecord(baseRecord({ email: 'new@example.com' })),
    ).rejects.toThrow(ConflictException);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ email: 'new@example.com' }),
      }),
    );
  });

  it('tier=非会员 on an existing record forces EXPIRED but never overwrites tier', async () => {
    const prisma = makePrismaMock();
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'user-1',
      larkUpdatedAt: null,
      referredByUserId: null,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      commissionSyncedAt: null,
    });
    const svc = new LarkSyncService(prisma as any);

    await svc.syncRecord(baseRecord({ tier: '非会员', status: '生效中' }));

    const upsertArgs = prisma.membership.upsert.mock.calls[0][0];
    expect(upsertArgs.update.status).toBe(MembershipStatus.EXPIRED);
    expect(upsertArgs.update.tier).toBeUndefined();
  });

  it('skips the Membership field write when the incoming larkUpdatedAt is older than stored', async () => {
    const prisma = makePrismaMock();
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'user-1',
      larkUpdatedAt: new Date('2026-06-01'),
      referredByUserId: null,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      commissionSyncedAt: null,
    });
    const svc = new LarkSyncService(prisma as any);

    await svc.syncRecord(baseRecord({ larkUpdatedAt: '2026-01-01' }));

    expect(prisma.membership.upsert).not.toHaveBeenCalled();
  });

  it('does not overwrite the known User email (or any basic info) when the incoming larkUpdatedAt is stale', async () => {
    const prisma = makePrismaMock();
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'user-1',
      larkUpdatedAt: new Date('2026-06-01'),
      referredByUserId: null,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      commissionSyncedAt: null,
    });
    const svc = new LarkSyncService(prisma as any);

    await svc.syncRecord(
      baseRecord({
        email: 'stale-new@example.com',
        larkUpdatedAt: '2026-01-01',
      }),
    );

    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: expect.anything(),
        }),
      }),
    );
    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: expect.anything(),
        }),
      }),
    );
    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phoneCountryCode: expect.anything(),
        }),
      }),
    );
    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phoneNo: expect.anything(),
        }),
      }),
    );
  });

  it('skips the commission AND referralCode overwrite when the incoming larkUpdatedAt is older than User.commissionSyncedAt', async () => {
    const prisma = makePrismaMock();
    // Route through the "known larkRecordId" path (not resolveOrCreateUser's $transaction path)
    // so this test isolates the freshness guard from user-creation concerns.
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'user-1',
      larkUpdatedAt: new Date('2026-01-01'),
      referredByUserId: null,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      commissionSyncedAt: new Date('2026-06-01'),
    });
    const svc = new LarkSyncService(prisma as any);

    await svc.syncRecord(
      baseRecord({
        pendingCommission: 999,
        referralCode: 'STALE-CODE',
        larkUpdatedAt: '2026-01-01',
      }),
    );

    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pendingCommission: 999 }),
      }),
    );
    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ referralCode: 'STALE-CODE' }),
      }),
    );
  });

  it('converts a referralCode uniqueness conflict into a 409, not a raw 500', async () => {
    const prisma = makePrismaMock();
    prisma.membership.findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'user-1',
      larkUpdatedAt: null,
      referredByUserId: null,
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      commissionSyncedAt: null,
    });
    prisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    const svc = new LarkSyncService(prisma as any);

    await expect(
      svc.syncRecord(baseRecord({ referralCode: 'TAKEN-CODE' })),
    ).rejects.toThrow(ConflictException);
  });

  it('leaves referredByUserId null when the referrer cannot be resolved yet', async () => {
    const prisma = makePrismaMock();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'jane@example.com',
      commissionSyncedAt: null,
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user-1', email: 'jane@example.com' }) // resolveOrCreateUser
      .mockResolvedValueOnce(null); // referrer lookup
    const svc = new LarkSyncService(prisma as any);

    await svc.syncRecord(
      baseRecord({ referredByEmail: 'unknown@example.com' }),
    );

    expect(prisma.membership.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: { referredByUserId: expect.anything() },
      }),
    );
  });
});

describe('LarkSyncService.syncBulk', () => {
  it('processes every record and returns a per-record result, even when one throws', async () => {
    const prisma = makePrismaMock();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      commissionSyncedAt: null,
    });
    const svc = new LarkSyncService(prisma as any);
    jest
      .spyOn(svc, 'syncRecord')
      .mockImplementationOnce(() => ({ id: 'm1' }) as any)
      .mockImplementationOnce(() => {
        throw new Error('boom');
      });

    const results = await svc.syncBulk([
      baseRecord({ larkRecordId: 'rec1', email: 'a@example.com' }),
      baseRecord({ larkRecordId: 'rec2', email: 'b@example.com' }),
    ]);

    expect(results).toEqual([
      { larkRecordId: 'rec1', status: 'ok' },
      { larkRecordId: 'rec2', status: 'error', reason: 'boom' },
    ]);
  });

  it('processes multiple records for the same new email sequentially, not concurrently', async () => {
    const prisma = makePrismaMock();
    const svc = new LarkSyncService(prisma as any);
    const callOrder: string[] = [];
    jest.spyOn(svc, 'syncRecord').mockImplementation(async (dto) => {
      callOrder.push(`start:${dto.larkRecordId}`);
      await new Promise((r) => setTimeout(r, 5));
      callOrder.push(`end:${dto.larkRecordId}`);
      return { id: dto.larkRecordId } as any;
    });

    await svc.syncBulk([
      baseRecord({ larkRecordId: 'rec1', email: 'same@example.com' }),
      baseRecord({ larkRecordId: 'rec2', email: 'same@example.com' }),
    ]);

    expect(callOrder).toEqual([
      'start:rec1',
      'end:rec1',
      'start:rec2',
      'end:rec2',
    ]);
  });

  it('two-pass referral resolution resolves the referrer even if it is ordered after the referred record', async () => {
    const prisma = makePrismaMock();
    const svc = new LarkSyncService(prisma as any);
    jest.spyOn(svc, 'syncRecord').mockImplementation(
      (dto) =>
        ({
          id: `m-${dto.larkRecordId}`,
          referredByUserId: null,
        }) as any,
    );
    prisma.membership.findUnique.mockImplementation(({ where }: any) => ({
      id: `m-${where.larkRecordId}`,
      referredByUserId: null,
    }));
    const resolveSpy = jest.spyOn(svc, 'resolveReferral').mockResolvedValue();

    await svc.syncBulk([
      baseRecord({
        larkRecordId: 'referred',
        email: 'child@example.com',
        referredByEmail: 'parent@example.com',
      }),
      baseRecord({ larkRecordId: 'referrer', email: 'parent@example.com' }),
    ]);

    expect(resolveSpy).toHaveBeenCalledWith('m-referred', 'parent@example.com');
  });

  it('isolates a pass-2 membership lookup failure to that record, leaving other results intact', async () => {
    const prisma = makePrismaMock();
    const svc = new LarkSyncService(prisma as any);
    jest.spyOn(svc, 'syncRecord').mockImplementation(
      (dto) =>
        ({
          id: `m-${dto.larkRecordId}`,
          referredByUserId: null,
        }) as any,
    );
    prisma.membership.findUnique.mockImplementation(({ where }: any) => {
      if (where.larkRecordId === 'broken') {
        throw new Error('connection lost');
      }
      return Promise.resolve({
        id: `m-${where.larkRecordId}`,
        referredByUserId: null,
      });
    });
    const resolveSpy = jest.spyOn(svc, 'resolveReferral').mockResolvedValue();

    const results = await svc.syncBulk([
      baseRecord({
        larkRecordId: 'broken',
        email: 'broken@example.com',
        referredByEmail: 'parent@example.com',
      }),
      baseRecord({
        larkRecordId: 'fine',
        email: 'fine@example.com',
        referredByEmail: 'parent@example.com',
      }),
    ]);

    expect(results).toEqual([
      { larkRecordId: 'broken', status: 'error', reason: 'connection lost' },
      { larkRecordId: 'fine', status: 'ok' },
    ]);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy).toHaveBeenCalledWith('m-fine', 'parent@example.com');
  });
});
