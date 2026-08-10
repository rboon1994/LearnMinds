import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { assertAdminCanAccessUser } from '../common/assert-admin-target';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CoursesService } from './courses.service';
import { CoursesQueryDto } from './dto/courses-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';

export type AuthReq = {
  user: {
    userId: string;
    tenantId: string | null;
    studentId: string | null;
    role: Role;
  };
};

// AdminFeatureGuard unconditionally forbids Role.USER (it assumes admin-only routes), so it's
// applied per-method below on the mutating/admin-list routes only — not at class level — since
// GET /courses and GET /courses/:id must stay reachable by Role.USER.
@Controller('courses')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class CoursesController {
  constructor(
    private svc: CoursesService,
    private prisma: PrismaService,
  ) {}

  @Get('admin')
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  findAllForAdmin(@Query() query: CoursesQueryDto, @Request() req: AuthReq) {
    return this.svc.findAllForAdmin(req.user.tenantId as string, query);
  }

  @Get('admin/all')
  @Roles(Role.SUPER_ADMIN)
  findAllForSuperAdmin(@Query() query: CoursesQueryDto) {
    return this.svc.findAllForSuperAdmin(query);
  }

  // Flat picker source for the admin Enrollments "Individual Course" dropdown.
  @Get('admin/list')
  @Roles(Role.SUPER_ADMIN)
  findAllFlat(@Query() query: CoursesQueryDto) {
    return this.svc.findAllFlat(query);
  }

  // Admin view of which lessons a given user has actually opened (vs. Enrollment, which only
  // proves access was granted). Tenant/existence re-checked here, not assumed from any prior
  // request — same 404-for-both-cases rule as the agent-chat admin routes.
  @Get('admin/users/:userId/lesson-views')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async findLessonViewsForUser(
    @Param('userId') userId: string,
    @Query() query: PaginationQueryDto,
    @Request() req: AuthReq,
  ) {
    await assertAdminCanAccessUser(this.prisma, req.user, userId);
    return this.svc.findLessonViewsForUserAsAdmin(userId, query);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER, Role.STUDENT)
  findBrowsable(@Request() req: AuthReq) {
    return this.svc.findBrowsable(req.user);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER, Role.STUDENT)
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
