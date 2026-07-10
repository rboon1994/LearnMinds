import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

// Minimal listing endpoint — only needed so Super Admin can pick a Tenant when assigning a
// course Enrollment; no other Tenant-management CRUD exists yet.
@Controller('tenants')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class TenantsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.tenant.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
