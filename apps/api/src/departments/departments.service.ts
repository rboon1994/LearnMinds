import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDepartmentDto } from './dto/create-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  findAll(tenantId: string | null) {
    return this.prisma.department.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateDepartmentDto, tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const systemNavIds = await this.prisma.navItem.findMany({
      where: {
        isSystem: true,
        isAllDepts: true,
        isAdminNav: false,
        packages: { has: tenant.package },
        status: Status.ACTIVE,
      },
      select: { id: true },
    });
    return this.prisma.department.create({
      data: {
        name: dto.name,
        tenantId,
        navItemIds: systemNavIds.map((n) => n.id),
      },
    });
  }

  async update(id: string, dto: CreateDepartmentDto, tenantId: string) {
    await this.prisma.department.findFirstOrThrow({ where: { id, tenantId } });
    return this.prisma.department.update({
      where: { id },
      data: { name: dto.name },
    });
  }

  async assignNavItems(id: string, navItemIds: string[], tenantId: string) {
    await this.prisma.department.findFirstOrThrow({ where: { id, tenantId } });
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const valid = await this.prisma.navItem.findMany({
      where: {
        id: { in: navItemIds },
        packages: { has: tenant.package },
        status: Status.ACTIVE,
      },
      select: { id: true },
    });
    if (valid.length !== navItemIds.length) {
      throw new BadRequestException(
        'One or more navItemIds are invalid or not visible to this package',
      );
    }
    return this.prisma.department.update({
      where: { id },
      data: { navItemIds },
    });
  }

  async assignUser(userId: string, deptId: string, tenantId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id: deptId, tenantId },
    });
    if (!dept) throw new NotFoundException();
    await this.prisma.user.update({
      where: { id: userId, tenantId },
      data: { departmentId: deptId },
    });
  }

  async delete(id: string, tenantId: string) {
    await this.prisma.department.findFirstOrThrow({ where: { id, tenantId } });
    const count = await this.prisma.user.count({ where: { departmentId: id } });
    if (count > 0)
      throw new ConflictException(
        `${count} user(s) still assigned — reassign first`,
      );
    await this.prisma.department.delete({ where: { id } });
  }

  // Called by NavItemsService when a NavItem is deleted
  async cleanupNavItemId(navItemId: string) {
    const depts = await this.prisma.department.findMany({
      where: { navItemIds: { has: navItemId } },
      select: { id: true, navItemIds: true },
    });
    await Promise.all(
      depts.map((d) =>
        this.prisma.department.update({
          where: { id: d.id },
          data: { navItemIds: d.navItemIds.filter((id) => id !== navItemId) },
        }),
      ),
    );
  }
}
