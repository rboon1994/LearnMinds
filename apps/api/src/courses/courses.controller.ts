import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';

export type AuthReq = {
  user: { userId: string; tenantId: string | null; role: Role };
};

// AdminFeatureGuard unconditionally forbids Role.USER (it assumes admin-only routes), so it's
// applied per-method below on the mutating/admin-list routes only — not at class level — since
// GET /courses and GET /courses/:id must stay reachable by Role.USER.
@Controller('courses')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class CoursesController {
  constructor(private svc: CoursesService) {}

  @Get('admin')
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  findAllForAdmin(@Request() req: AuthReq) {
    return this.svc.findAllForAdmin(req.user.tenantId as string);
  }

  @Get('admin/all')
  @Roles(Role.SUPER_ADMIN)
  findAllForSuperAdmin() {
    return this.svc.findAllForSuperAdmin();
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER)
  findBrowsable(@Request() req: AuthReq) {
    return this.svc.findBrowsable(req.user);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER)
  findOne(@Param('id') id: string, @Request() req: AuthReq) {
    return this.svc.findOne(id, req.user);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  create(@Body() dto: CreateCourseDto, @Request() req: AuthReq) {
    return this.svc.create(dto, req.user);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateCourseDto>,
    @Request() req: AuthReq,
  ) {
    return this.svc.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  delete(@Param('id') id: string, @Request() req: AuthReq) {
    return this.svc.delete(id, req.user);
  }
}
