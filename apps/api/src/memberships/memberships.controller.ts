import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MembershipsService } from './memberships.service';

// Super-Admin-only, read-only — every write to Membership data comes from the `lark` module.
@Controller('memberships')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class MembershipsController {
  constructor(private svc: MembershipsService) {}

  @Get('admin/users/:userId')
  findForUser(@Param('userId') userId: string) {
    return this.svc.getMembershipsForUser(userId);
  }
}
