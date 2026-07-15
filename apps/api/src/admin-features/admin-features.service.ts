import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TenantPackage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpsertAdminFeatureDto } from './dto/upsert-admin-feature.dto';

@Injectable()
export class AdminFeaturesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.adminFeature.findMany({ orderBy: { order: 'asc' } });
  }

  async reorder(ids: string[]) {
    const existing = await this.prisma.adminFeature.count({
      where: { id: { in: ids } },
    });
    if (existing !== ids.length)
      throw new BadRequestException('One or more feature ids do not exist');
    return this.prisma.$transaction(
      ids.map((id, order) =>
        this.prisma.adminFeature.update({ where: { id }, data: { order } }),
      ),
    );
  }

  async create(dto: UpsertAdminFeatureDto) {
    const last = await this.prisma.adminFeature.aggregate({
      _max: { order: true },
    });
    return this.prisma.adminFeature.create({
      data: { ...dto, order: (last._max.order ?? -1) + 1 },
    });
  }

  update(id: string, dto: Partial<UpsertAdminFeatureDto>) {
    return this.prisma.adminFeature.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const feature = await this.prisma.adminFeature.findUniqueOrThrow({
      where: { id },
    });
    if (feature.isSystem)
      throw new ForbiddenException('System features cannot be deleted');
    await this.prisma.adminFeature.delete({ where: { id } });
  }

  updatePackages(id: string, packages: TenantPackage[]) {
    return this.prisma.adminFeature.update({
      where: { id },
      data: { packages },
    });
  }
}
