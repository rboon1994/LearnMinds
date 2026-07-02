import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role, TenantPackage } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminFeaturesService } from './admin-features.service';
import { UpsertAdminFeatureDto } from './dto/upsert-admin-feature.dto';

@Controller('admin-features')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class AdminFeaturesController {
  constructor(private svc: AdminFeaturesService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  create(@Body() dto: UpsertAdminFeatureDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertAdminFeatureDto>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  @Patch(':id/packages')
  updatePackages(@Param('id') id: string, @Body('packages') packages: TenantPackage[]) {
    return this.svc.updatePackages(id, packages);
  }
}
