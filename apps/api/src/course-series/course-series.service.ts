import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCourseSeriesDto } from './dto/create-course-series.dto';

@Injectable()
export class CourseSeriesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.courseSeries.findMany({
      include: { _count: { select: { courses: true } } },
      orderBy: { name: 'asc' },
    });
  }

  create(dto: CreateCourseSeriesDto) {
    return this.prisma.courseSeries.create({ data: { name: dto.name } });
  }

  async update(id: string, dto: CreateCourseSeriesDto) {
    await this.prisma.courseSeries.findUniqueOrThrow({ where: { id } });
    return this.prisma.courseSeries.update({
      where: { id },
      data: { name: dto.name },
    });
  }

  async delete(id: string) {
    await this.prisma.courseSeries.findUniqueOrThrow({ where: { id } });
    const count = await this.prisma.enrollment.count({
      where: { seriesId: id },
    });
    if (count > 0) {
      throw new ConflictException(
        `${count} enrollment(s) still reference this series — revoke them first`,
      );
    }
    await this.prisma.courseSeries.delete({ where: { id } });
  }
}
