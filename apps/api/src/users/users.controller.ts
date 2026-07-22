import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersQueryDto } from './dto/users-query.dto';
import { UserScope } from './dto/user-scope.enum';
import { UsersService, ScopeFilter } from './users.service';

type AuthReq = { user: { tenantId: string | null; role: Role } };

// SUPER_ADMIN always bypasses both RolesGuard and AdminFeatureGuard (per their existing
// implementations) — @Roles(Role.ADMIN) here only grants the ADMIN role explicitly.
// scope=platform (Platform Admins) is further restricted to SUPER_ADMIN per-method below.
@Controller('users')
@UseGuards(RolesGuard, AdminFeatureGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get()
  findAll(@Query() query: UsersQueryDto, @Request() req: AuthReq) {
    if (
      query.scope === UserScope.PLATFORM &&
      req.user.role !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException();
    }
    if (query.scope === UserScope.TENANT && req.user.role === Role.ADMIN) {
      return this.svc.findAll(query, req.user.tenantId);
    }
    const tenantId =
      query.scope === UserScope.TENANT ? (query.tenantId ?? null) : null;
    if (query.scope === UserScope.TENANT && !tenantId) {
      return {
        data: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: 1,
      };
    }
    return this.svc.findAll(query, tenantId);
  }

  @Post()
  @RequireFeature('user-management')
  create(@Body() dto: CreateUserDto, @Request() req: AuthReq) {
    if (
      dto.scope === UserScope.PLATFORM &&
      req.user.role !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException();
    }
    const tenantId =
      dto.scope === UserScope.TENANT
        ? req.user.role === Role.ADMIN
          ? req.user.tenantId
          : (dto.tenantId ?? null)
        : null;
    if (dto.scope === UserScope.TENANT && !tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.svc.create(dto, tenantId);
  }

  @Patch(':id')
  @RequireFeature('user-management')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: AuthReq,
  ) {
    return this.svc.update(id, dto, this.scopeFilter(req));
  }

  @Delete(':id')
  @RequireFeature('user-management')
  delete(@Param('id') id: string, @Request() req: AuthReq) {
    return this.svc.delete(id, this.scopeFilter(req));
  }

  @Patch(':id/reset-password')
  @RequireFeature('user-management')
  resetPassword(@Param('id') id: string, @Request() req: AuthReq) {
    return this.svc.resetPassword(id, this.scopeFilter(req));
  }

  private scopeFilter(req: AuthReq): ScopeFilter {
    return req.user.role === Role.ADMIN
      ? { role: Role.USER, tenantId: req.user.tenantId as string }
      : null;
  }
}
