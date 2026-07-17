import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role, Status } from '@prisma/client';
import { paginate } from '../common/paginate';
import { PrismaService } from '../prisma/prisma.service';
import { TEMP_PASSWORD } from '../common/temp-password';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UsersQueryDto } from './dto/users-query.dto';
import { UserScope } from './dto/user-scope.enum';

// null = caller is SUPER_ADMIN — may act on any role=USER or role=SUPER_ADMIN row.
// non-null = caller is ADMIN — forced to role=USER rows within their own tenantId.
export type ScopeFilter = { role: Role; tenantId: string } | null;

const selectFields = {
  id: true,
  email: true,
  fullName: true,
  phoneCountryCode: true,
  phoneNo: true,
  status: true,
  role: true,
  tenantId: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  lastSignInAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: UsersQueryDto, tenantId: string | null) {
    const search = query.search?.trim();
    const searchDigits = search?.replace(/\D/g, '');
    const role = query.scope === UserScope.PLATFORM ? Role.SUPER_ADMIN : Role.USER;
    const where: Prisma.UserWhereInput = {
      role,
      tenantId: query.scope === UserScope.PLATFORM ? null : tenantId,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              ...(searchDigits
                ? [
                    { phoneNo: { contains: searchDigits } },
                    { phoneCountryCode: { contains: searchDigits } },
                  ]
                : []),
            ],
          }
        : {}),
    };
    return paginate<Prisma.UserGetPayload<{ select: typeof selectFields }>, Prisma.UserWhereInput>(
      this.prisma.user,
      { where, select: selectFields, orderBy: { createdAt: 'desc' } },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  // Guards against an ADMIN assigning a departmentId that belongs to a different tenant —
  // Prisma's FK alone doesn't stop a valid-but-foreign departmentId from being written.
  private async assertDepartmentInTenant(departmentId: string, tenantId: string) {
    await this.prisma.department.findFirstOrThrow({ where: { id: departmentId, tenantId } });
  }

  async create(dto: CreateUserDto, tenantId: string | null) {
    const role = dto.scope === UserScope.PLATFORM ? Role.SUPER_ADMIN : Role.USER;
    if (role === Role.USER && dto.departmentId) {
      await this.assertDepartmentInTenant(dto.departmentId, tenantId as string);
    }
    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    try {
      return await this.prisma.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email,
          password: hashed,
          phoneCountryCode: dto.phoneCountryCode,
          phoneNo: dto.phoneNo,
          role,
          tenantId: role === Role.SUPER_ADMIN ? null : tenantId,
          departmentId: role === Role.USER ? dto.departmentId : undefined,
          mustChangePassword: true,
          status: Status.INACTIVE,
        },
        select: selectFields,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  private findOneScoped(id: string, scope: ScopeFilter) {
    return this.prisma.user.findFirstOrThrow({
      where: scope
        ? { id, role: scope.role, tenantId: scope.tenantId }
        : { id, role: { in: [Role.USER, Role.SUPER_ADMIN] } },
    });
  }

  async update(id: string, dto: UpdateUserDto, scope: ScopeFilter) {
    const existing = await this.findOneScoped(id, scope);

    // Build data object explicitly: only persist departmentId for role=USER rows.
    // UserUncheckedUpdateInput (not UserUpdateInput) is required here — the "checked" variant
    // replaces the departmentId FK scalar with a nested `department` relation object instead.
    const data: Prisma.UserUncheckedUpdateInput = {
      ...(dto.fullName !== undefined && { fullName: dto.fullName }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phoneCountryCode !== undefined && { phoneCountryCode: dto.phoneCountryCode }),
      ...(dto.phoneNo !== undefined && { phoneNo: dto.phoneNo }),
    };

    // Only persist departmentId for Tenant Users (role=USER), and validate it
    if (existing.role === Role.USER && dto.departmentId) {
      await this.assertDepartmentInTenant(dto.departmentId, existing.tenantId as string);
      data.departmentId = dto.departmentId;
    }

    try {
      return await this.prisma.user.update({ where: { id }, data, select: selectFields });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  async delete(id: string, scope: ScopeFilter) {
    await this.findOneScoped(id, scope);
    await this.prisma.user.delete({ where: { id } });
  }

  async resetPassword(id: string, scope: ScopeFilter) {
    await this.findOneScoped(id, scope);
    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    return this.prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true, status: Status.INACTIVE },
      select: selectFields,
    });
  }
}
