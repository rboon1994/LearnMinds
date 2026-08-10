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
  course: { select: { id: true, title: true, startDate: true, endDate: true } },
  agent: { select: { id: true, name: true } },
} satisfies Prisma.EnrollmentInclude;

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  // Search matches the student's name/email, the tenant's name, the course series name, or the
  // individual course title — each via `contains`, joined with OR across the relations.
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
            { course: { title: { contains: search, mode: 'insensitive' } } },
            { agent: { name: { contains: search, mode: 'insensitive' } } },
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

  // Letting the [seriesId, studentId]/[seriesId, tenantId]/[courseId, studentId]/
  // [courseId, tenantId] unique constraints do the dedup check (via the P2002 catch below)
  // avoids a check-then-insert race. The XOR checks below are also backstopped at the DB level
  // by chk_enrollment_assignee/chk_enrollment_target (see the migration) — this is defense in
  // depth, not the only guard.
  async create(dto: CreateEnrollmentDto, enrolledById: string) {
    if (Boolean(dto.studentId) === Boolean(dto.tenantId)) {
      throw new BadRequestException(
        'Exactly one of studentId or tenantId is required',
      );
    }
    if (
      [dto.seriesId, dto.courseId, dto.agentId].filter(Boolean).length !== 1
    ) {
      throw new BadRequestException(
        'Exactly one of seriesId, courseId, or agentId is required',
      );
    }
    try {
      return await this.prisma.enrollment.create({
        data: {
          seriesId: dto.seriesId,
          courseId: dto.courseId,
          agentId: dto.agentId,
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

  // The Edit dialog UI locks an enrollment's type (Series vs Course vs Agent) at creation, but
  // that's a client affordance, not enforcement — reject any attempt to flip it via a direct API
  // call. `!= null` (not `!== undefined`) so an explicitly-sent `null` for an inactive field
  // (some form libraries send all fields, unused ones as null) isn't mistaken for "trying to
  // switch".
  async update(id: string, dto: UpdateEnrollmentDto) {
    const existing = await this.prisma.enrollment.findUniqueOrThrow({
      where: { id },
      select: { seriesId: true, courseId: true, agentId: true },
    });
    if (
      existing.seriesId !== null &&
      (dto.courseId != null || dto.agentId != null)
    ) {
      throw new BadRequestException(
        'Cannot change a series enrollment into a course or agent enrollment',
      );
    }
    if (
      existing.courseId !== null &&
      (dto.seriesId != null || dto.agentId != null)
    ) {
      throw new BadRequestException(
        'Cannot change a course enrollment into a series or agent enrollment',
      );
    }
    if (
      existing.agentId !== null &&
      (dto.seriesId != null || dto.courseId != null)
    ) {
      throw new BadRequestException(
        'Cannot change an agent enrollment into a series or course enrollment',
      );
    }
    try {
      return await this.prisma.enrollment.update({
        where: { id },
        data: {
          seriesId: dto.seriesId,
          courseId: dto.courseId,
          agentId: dto.agentId,
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
