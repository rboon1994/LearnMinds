import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role, TenantPackage } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { NavItemsService } from './nav-items.service';
import { UpsertNavItemDto } from './dto/upsert-nav-item.dto';

@Controller('nav-items')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class NavItemsController {
  constructor(private svc: NavItemsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  create(@Body() dto: UpsertNavItemDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertNavItemDto>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  @Patch(':id/packages')
  updatePackages(
    @Param('id') id: string,
    @Body('packages') packages: TenantPackage[],
  ) {
    return this.svc.updatePackages(id, packages);
  }

  @Patch(':id/student-visible')
  updateStudentVisible(
    @Param('id') id: string,
    @Body('isStudentVisible') isStudentVisible: boolean,
  ) {
    return this.svc.updateStudentVisible(id, isStudentVisible);
  }
}
