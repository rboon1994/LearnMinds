import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminFeatureGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    if (user.role === Role.SUPER_ADMIN) return true;
    if (user.role === Role.USER) throw new ForbiddenException();
    if (!user.tenantId) throw new ForbiddenException();

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    const key = this.reflector.get<string>('feature', context.getHandler());
    if (!key) return true;
    const feature = await this.prisma.adminFeature.findUniqueOrThrow({ where: { key } });
    if (!feature.packages.includes(tenant.package)) throw new ForbiddenException();
    return true;
  }
}
