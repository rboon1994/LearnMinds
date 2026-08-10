import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DepartmentsService } from '../departments/departments.service';
import type { UpsertNavItemDto } from './dto/upsert-nav-item.dto';

@Injectable()
export class NavItemsService {
  constructor(
    private prisma: PrismaService,
    private depts: DepartmentsService,
  ) {}

  findAll() {
    return this.prisma.navItem.findMany({ orderBy: { order: 'asc' } });
  }

  async reorder(ids: string[]) {
    const existing = await this.prisma.navItem.count({
      where: { id: { in: ids } },
    });
    if (existing !== ids.length)
      throw new BadRequestException('One or more nav item ids do not exist');
    return this.prisma.$transaction(
      ids.map((id, order) =>
        this.prisma.navItem.update({ where: { id }, data: { order } }),
      ),
    );
  }

  create(dto: UpsertNavItemDto) {
    return this.prisma.navItem.create({ data: dto });
  }

  update(id: string, dto: Partial<UpsertNavItemDto>) {
    return this.prisma.navItem.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const item = await this.prisma.navItem.findUniqueOrThrow({ where: { id } });
    if (item.isSystem)
      throw new ForbiddenException('System nav items cannot be deleted');
    await this.depts.cleanupNavItemId(id);
    await this.prisma.navItem.delete({ where: { id } });
  }

  updatePackages(id: string, packages: string[]) {
    return this.prisma.navItem.update({
      where: { id },
      data: { packages: packages as any },
    });
  }

  updateStudentVisible(id: string, isStudentVisible: boolean) {
    return this.prisma.navItem.update({
      where: { id },
      data: { isStudentVisible },
    });
  }
}
