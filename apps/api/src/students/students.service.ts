import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { StudentRowDto } from './dto/bulk-register-students.dto';
import type { UpdateStudentDto } from './dto/update-student.dto';

// Fixed temp password for every bulk-registered Student — no per-row generation/distribution
// needed; mustChangePassword forces them off it on first login.
const TEMP_PASSWORD = 'BeProminds';

export type BulkRegisterResult = {
  email: string;
  status: 'created' | 'skipped';
  reason?: string;
};

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  private static readonly selectFields = {
    id: true,
    email: true,
    fullName: true,
    phoneCountryCode: true,
    phoneNo: true,
    status: true,
    lastSignInAt: true,
    createdAt: true,
  } as const;

  findAll() {
    return this.prisma.user.findMany({
      where: { studentId: { not: null } },
      select: StudentsService.selectFields,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.user.findFirstOrThrow({
      where: { id, studentId: { not: null } },
      select: StudentsService.selectFields,
    });
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);
    try {
      return await this.prisma.user.update({
        where: { id },
        data: dto,
        select: StudentsService.selectFields,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
  }

  // Back to the fixed bulk-register temp password, with mustChangePassword forcing them off it again.
  async resetPassword(id: string) {
    await this.findOne(id);
    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    return this.prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true },
      select: StudentsService.selectFields,
    });
  }

  // Sequential (not Promise.all) so a duplicate email appearing twice within the same batch is
  // correctly skipped on its second occurrence, not raced into two concurrent creates.
  async bulkRegister(rows: StudentRowDto[]): Promise<BulkRegisterResult[]> {
    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    const results: BulkRegisterResult[] = [];

    for (const row of rows) {
      const existing = await this.prisma.user.findUnique({
        where: { email: row.email },
      });
      if (existing) {
        results.push({
          email: row.email,
          status: 'skipped',
          reason: 'Email already registered',
        });
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.create({ data: {} });
        await tx.user.create({
          data: {
            fullName: row.fullName.trim(),
            email: row.email,
            password: hashed,
            phoneCountryCode: row.phoneCountryCode,
            phoneNo: row.phoneNo,
            role: Role.STUDENT,
            studentId: student.id,
            mustChangePassword: true,
          },
        });
      });
      results.push({ email: row.email, status: 'created' });
    }

    return results;
  }
}
