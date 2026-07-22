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

describe('AuthService.validateUser', () => {
  it("allows login for an INACTIVE account (hasn't changed its initial password yet)", async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    const prisma = makePrismaMock({
      id: 'u1',
      email: 'a@b.com',
      password: hashed,
      status: Status.INACTIVE,
    });
    const svc = new AuthService(prisma as any, jwtMock);
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
    const svc = new AuthService(prisma as any, jwtMock);
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
    const svc = new AuthService(prisma as any, jwtMock);
    await expect(
      svc.validateUser('a@b.com', 'correct-password'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('AuthService.changePassword', () => {
  it('sets status to ACTIVE alongside clearing mustChangePassword', async () => {
    const hashed = await bcrypt.hash('old-password', 10);
    const prisma = makePrismaMock({ id: 'u1', password: hashed });
    const svc = new AuthService(prisma as any, jwtMock);
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
