import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate } from '../common/paginate';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import type { EnrollmentsQueryDto } from './dto/enrollments-query.dto';
import type { UpdateEnrollmentDto } from './dto/update-enrollment.dto';

const enrollmentInclude = {
  student: {
    include: { user: { select: { fullName: true, email: true } } },
  },
  tenant: { select: { id: true, name: true } },
  series: { select: { id: true, name: true } },
} satisfies Prisma.EnrollmentInclude;

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  // Search matches the student's name/email, the tenant's name, or the course series name —
  // each via `contains`, joined with OR across the relations.
  findAll(query: EnrollmentsQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.EnrollmentWhereInput = search
      ? {
          OR: [
            {
              student: {
                user: { fullName: { contains: search, mode: 'insensitive' } },
              },
            },
            {
              student: {
                user: { email: { contains: search, mode: 'insensitive' } },
              },
            },
            { tenant: { name: { contains: search, mode: 'insensitive' } } },
            { series: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};
    return paginate<
      Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>,
      Prisma.EnrollmentWhereInput
    >(
      this.prisma.enrollment,
      { where, include: enrollmentInclude, orderBy: { createdAt: 'desc' } },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  // Letting the [seriesId, studentId]/[seriesId, tenantId] unique constraints do the dedup
  // check (via the P2002 catch below) avoids a check-then-insert race.
  async create(dto: CreateEnrollmentDto, enrolledById: string) {
    if (Boolean(dto.studentId) === Boolean(dto.tenantId)) {
      throw new BadRequestException(
        'Exactly one of studentId or tenantId is required',
      );
    }
    try {
      return await this.prisma.enrollment.create({
        data: {
          seriesId: dto.seriesId,
          studentId: dto.studentId,
          tenantId: dto.tenantId,
          enrolledById,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Already enrolled in this series');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateEnrollmentDto) {
    try {
      return await this.prisma.enrollment.update({
        where: { id },
        data: {
          seriesId: dto.seriesId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Already enrolled in this series');
      }
      throw err;
    }
  }

  delete(id: string) {
    return this.prisma.enrollment.delete({ where: { id } });
  }
}
