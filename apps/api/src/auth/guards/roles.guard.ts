import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user.role === Role.SUPER_ADMIN) return true;
    const roles = this.reflector.get<Role[]>('roles', context.getHandler());
    if (!roles) return false;
    return roles.includes(user.role);
  }
}
