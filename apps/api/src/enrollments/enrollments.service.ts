import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEnrollmentDto } from './dto/create-enrollment.dto';

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.enrollment.findMany({
      include: {
        student: {
          include: { user: { select: { fullName: true, email: true } } },
        },
        tenant: { select: { id: true, name: true } },
        series: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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

  delete(id: string) {
    return this.prisma.enrollment.delete({ where: { id } });
  }
}
