import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role } from '@prisma/client';
import { paginate } from '../common/paginate';
import { PrismaService } from '../prisma/prisma.service';
import type { StudentRowDto } from './dto/bulk-register-students.dto';
import type { StudentsQueryDto } from './dto/students-query.dto';
import type { UpdateStudentDto } from './dto/update-student.dto';

// Fixed temp password for every bulk-registered Student — no per-row generation/distribution
// needed; mustChangePassword forces them off it on first login.
const TEMP_PASSWORD = 'BeProminds';

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
  mustChangePassword: true,
  lastSignInAt: true,
  createdAt: true,
} as const;

// The admin-facing "status" is derived from mustChangePassword, not the account status
// enum — a Student is Inactive until they set their own password, Active from then on.
function toStudentDto<T extends { mustChangePassword: boolean }>({
  mustChangePassword,
  ...row
}: T) {
  return {
    ...row,
    status: mustChangePassword ? 'INACTIVE' : ('ACTIVE' as const),
  };
}

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
    };
    const result = await paginate<
      Prisma.UserGetPayload<{ select: typeof selectFields }>,
      Prisma.UserWhereInput
    >(
      this.prisma.user,
      { where, select: selectFields, orderBy: { createdAt: 'desc' } },
      { page: query.page, pageSize: query.pageSize },
    );
    return { ...result, data: result.data.map(toStudentDto) };
  }

  async findOne(id: string) {
    const row = await this.prisma.user.findFirstOrThrow({
      where: { id, studentId: { not: null } },
      select: selectFields,
    });
    return toStudentDto(row);
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);
    try {
      const row = await this.prisma.user.update({
        where: { id },
        data: dto,
        select: selectFields,
      });
      return toStudentDto(row);
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

  // Deletes the User row and its Student satellite row together — Student otherwise survives
  // as an orphan forever, since the FK runs User.studentId -> Student.id with no cascade back.
  // Enrollment rows cascade-delete automatically (onDelete: Cascade on Enrollment.student).
  async delete(id: string) {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id, studentId: { not: null } },
      select: { studentId: true },
    });
    await this.prisma.$transaction([
      this.prisma.user.delete({ where: { id } }),
      this.prisma.student.delete({ where: { id: user.studentId! } }),
    ]);
  }

  // Back to the fixed bulk-register temp password, with mustChangePassword forcing them off it again.
  async resetPassword(id: string) {
    await this.findOne(id);
    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    const row = await this.prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true },
      select: selectFields,
    });
    return toStudentDto(row);
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
