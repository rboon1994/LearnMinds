import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { AssignNavItemsDto } from './dto/assign-nav-items.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { FindDepartmentsQueryDto } from './dto/find-departments-query.dto';
import { DepartmentsService } from './departments.service';

type AuthReq = { user: { tenantId: string | null; role: string } };

@Controller('departments')
@UseGuards(RolesGuard, AdminFeatureGuard)
@Roles(Role.ADMIN)
export class DepartmentsController {
  constructor(private svc: DepartmentsService) {}

  @Get()
  findAll(@Request() req: AuthReq, @Query() query: FindDepartmentsQueryDto) {
    const tenantId = req.user.role === Role.ADMIN ? req.user.tenantId : (query.tenantId ?? null);
    return this.svc.findAll(tenantId);
  }

  @Post()
  @RequireFeature('department-management')
  create(@Body() dto: CreateDepartmentDto, @Request() req: AuthReq) {
    return this.svc.create(dto, req.user.tenantId!);
  }

  @Patch(':id')
  @RequireFeature('department-management')
  update(
    @Param('id') id: string,
    @Body() dto: CreateDepartmentDto,
    @Request() req: AuthReq,
  ) {
    return this.svc.update(id, dto, req.user.tenantId!);
  }

  @Delete(':id')
  @RequireFeature('department-management')
  delete(@Param('id') id: string, @Request() req: AuthReq) {
    return this.svc.delete(id, req.user.tenantId!);
  }

  @Put(':id/nav-items')
  @RequireFeature('department-management')
  assignNavItems(
    @Param('id') id: string,
    @Body() dto: AssignNavItemsDto,
    @Request() req: AuthReq,
  ) {
    return this.svc.assignNavItems(id, dto.navItemIds, req.user.tenantId!);
  }

  @Put(':id/users/:userId')
  @RequireFeature('department-management')
  assignUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: AuthReq,
  ) {
    return this.svc.assignUser(userId, id, req.user.tenantId!);
  }
}
