import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role, Status } from '@prisma/client';
import { paginate } from '../common/paginate';
import { PrismaService } from '../prisma/prisma.service';
import { TEMP_PASSWORD } from '../common/temp-password';
import type { StudentRowDto } from './dto/bulk-register-students.dto';
import type { StudentsQueryDto } from './dto/students-query.dto';
import type { UpdateStudentDto } from './dto/update-student.dto';

export type BulkRegisterResult = {
  email: string;
  status: 'created' | 'skipped';
  reason?: string;
};

const selectFields = {
  id: true,
  studentId: true,
  email: true,
  fullName: true,
  phoneCountryCode: true,
  phoneNo: true,
  status: true,
  lastSignInAt: true,
  createdAt: true,
  _count: { select: { agentConversations: true, lessonViews: true } },
} as const;

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  // Phone search matches phoneCountryCode/phoneNo as separate columns (each via `contains`), not
  // the two concatenated — Prisma can't filter on a computed concat without raw SQL. Covers
  // searching by just the local number or just the country code; doesn't match the exact
  // country-code+number typed as one unbroken string (e.g. "60123456789").
  async findAll(query: StudentsQueryDto) {
    const search = query.search?.trim();
    const searchDigits = search?.replace(/\D/g, '');
    const where: Prisma.UserWhereInput = {
      studentId: { not: null },
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              ...(searchDigits
                ? [
                    { phoneNo: { contains: searchDigits } },
                    { phoneCountryCode: { contains: searchDigits } },
                  ]
                : []),
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    return paginate<
      Prisma.UserGetPayload<{ select: typeof selectFields }>,
      Prisma.UserWhereInput
    >(
      this.prisma.user,
      { where, select: selectFields, orderBy: { createdAt: 'desc' } },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  async findOne(id: string) {
    return this.prisma.user.findFirstOrThrow({
      where: { id, studentId: { not: null } },
      select: selectFields,
    });
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);
    try {
      return await this.prisma.user.update({
        where: { id },
        data: dto,
        select: selectFields,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  // Un-suspending goes through resetPassword instead of a direct status write — ACTIVE is never
  // admin-settable, only reachable by the student actually logging in and changing their password.
  async suspend(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { status: Status.SUSPENDED },
      select: selectFields,
    });
  }

  // Back to the fixed bulk-register temp password; status returns to INACTIVE until the
  // Student changes it again via /auth/change-password.
  async resetPassword(id: string) {
    await this.findOne(id);
    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    return this.prisma.user.update({
      where: { id },
      data: {
        password: hashed,
        mustChangePassword: true,
        status: Status.INACTIVE,
      },
      select: selectFields,
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
            status: Status.INACTIVE,
          },
        });
      });
      results.push({ email: row.email, status: 'created' });
    }

    return results;
  }
}
