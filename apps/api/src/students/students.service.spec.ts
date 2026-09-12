import 'reflect-metadata';
import { Status } from '@prisma/client';
import { StudentsService } from './students.service';
import type { StudentRowDto } from './dto/bulk-register-students.dto';

function makePrismaMock() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    student: {
      create: jest.fn().mockResolvedValue({ id: 'student-1' }),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function makeMembershipsMock() {
  return { closeExpiredMemberships: jest.fn().mockResolvedValue(undefined) };
}

describe('StudentsService', () => {
  it('bulkRegister creates each new Student with status: INACTIVE', async () => {
    const prisma = makePrismaMock();
    const createSpy = jest.fn();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          student: { create: jest.fn().mockResolvedValue({ id: 'student-1' }) },
          user: { create: createSpy },
        }),
    );
    const svc = new StudentsService(
      prisma as any,
      makeMembershipsMock() as any,
    );
    await svc.bulkRegister([
      {
        fullName: 'Jane',
        email: 'jane@example.com',
        rowNumber: 2,
      } as StudentRowDto,
    ]);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: Status.INACTIVE }),
      }),
    );
  });

  it('resetPassword sets status back to INACTIVE', async () => {
    const prisma = makePrismaMock();
    prisma.user.findFirstOrThrow.mockResolvedValue({
      id: 'user-1',
      studentId: 'student-1',
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      status: Status.INACTIVE,
    });
    const svc = new StudentsService(
      prisma as any,
      makeMembershipsMock() as any,
    );
    await svc.resetPassword('user-1');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mustChangePassword: true,
          status: Status.INACTIVE,
        }),
      }),
    );
  });
});
