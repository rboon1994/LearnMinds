import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantPackage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpsertAdminFeatureDto } from './dto/upsert-admin-feature.dto';

@Injectable()
export class AdminFeaturesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.adminFeature.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: UpsertAdminFeatureDto) {
    return this.prisma.adminFeature.create({ data: dto });
  }

  update(id: string, dto: Partial<UpsertAdminFeatureDto>) {
    return this.prisma.adminFeature.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const feature = await this.prisma.adminFeature.findUniqueOrThrow({ where: { id } });
    if (feature.isSystem) throw new ForbiddenException('System features cannot be deleted');
    await this.prisma.adminFeature.delete({ where: { id } });
  }

  updatePackages(id: string, packages: TenantPackage[]) {
    return this.prisma.adminFeature.update({ where: { id }, data: { packages } });
  }
}
