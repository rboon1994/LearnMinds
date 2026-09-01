import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEventCategoryDto } from './dto/create-event-category.dto';

@Injectable()
export class EventCategoriesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.eventCategory.findMany({
      include: { _count: { select: { events: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateEventCategoryDto) {
    await this.assertNameAvailable(dto.name);
    return this.prisma.eventCategory.create({ data: { name: dto.name } });
  }

  async update(id: string, dto: CreateEventCategoryDto) {
    await this.prisma.eventCategory.findUniqueOrThrow({ where: { id } });
    await this.assertNameAvailable(dto.name, id);
    return this.prisma.eventCategory.update({
      where: { id },
      data: { name: dto.name },
    });
  }

  // Fast, friendly rejection for the common (non-racing) case — the @unique DB constraint
  // (schema.prisma) is what actually guarantees uniqueness under concurrent requests; this
  // check alone can't. A rare race that slips past this still can't create a duplicate: the
  // resulting P2002 is caught by the global PrismaExceptionFilter and returned as a 409.
  private async assertNameAvailable(name: string, excludeId?: string) {
    const existing = await this.prisma.eventCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('A category with this name already exists');
    }
  }

  // No usage-count guard needed (unlike CourseSeries/Enrollment) — Event.categories is an
  // implicit many-to-many, so Prisma cascades the join-table rows automatically; deleting a
  // category just untags every Event that had it, no orphaned foreign key possible.
  async delete(id: string) {
    await this.prisma.eventCategory.findUniqueOrThrow({ where: { id } });
    await this.prisma.eventCategory.delete({ where: { id } });
  }
}
