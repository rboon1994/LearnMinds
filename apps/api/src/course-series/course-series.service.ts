import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCourseSeriesDto } from './dto/create-course-series.dto';
import type { CourseSeriesQueryDto } from './dto/course-series-query.dto';

@Injectable()
export class CourseSeriesService {
  constructor(private prisma: PrismaService) {}

  // `hasCourses` is opt-in — the Course-edit "assign to series" picker and the Manage Series
  // dialog both need to see empty series too (to assign a series' first course, or to manage a
  // freshly created one), so filtering to non-empty series only happens when explicitly asked.
  findAll(query: CourseSeriesQueryDto = {}) {
    return this.prisma.courseSeries.findMany({
      where: query.hasCourses ? { courses: { some: {} } } : undefined,
      include: { _count: { select: { courses: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateCourseSeriesDto) {
    await this.assertNameAvailable(dto.name);
    return this.prisma.courseSeries.create({ data: { name: dto.name } });
  }

  async update(id: string, dto: CreateCourseSeriesDto) {
    await this.prisma.courseSeries.findUniqueOrThrow({ where: { id } });
    await this.assertNameAvailable(dto.name, id);
    return this.prisma.courseSeries.update({
      where: { id },
      data: { name: dto.name },
    });
  }

  private async assertNameAvailable(name: string, excludeId?: string) {
    const existing = await this.prisma.courseSeries.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('A series with this name already exists');
    }
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
