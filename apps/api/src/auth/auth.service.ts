import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role, Status, Tenant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'SUSPENDED') throw new ForbiddenException('Account suspended');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 10);
    const now = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: dto.organization } });
      return tx.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email,
          password: hashed,
          phoneCountryCode: dto.phoneCountryCode,
          phoneNo: dto.phoneNo,
          tenantId: tenant.id,
          role: 'ADMIN',
          lastSignInAt: now,
        },
      });
    });

    return { access_token: this.sign(user) };
  }

  async login(user: { id: string; tenantId: string; email: string; role: string }) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSignInAt: new Date() },
    });
    return { access_token: this.sign(user) };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        tenantId: true,
        departmentId: true,
        tenant: { select: { id: true, name: true, package: true } },
        department: { select: { id: true, name: true } },
      },
    });

    const [navItems, adminFeatures] = await Promise.all([
      this.getNavItems(user, user.tenant),
      this.getAdminFeatures(user, user.tenant),
    ]);

    return { ...user, navItems, adminFeatures };
  }

  private async getNavItems(
    user: { role: string; departmentId: string | null },
    tenant: { package: Tenant['package'] } | null,
  ) {
    const pkg = tenant?.package;
    const baseWhere = pkg
      ? { status: Status.ACTIVE, packages: { has: pkg } }
      : { status: Status.ACTIVE };

    if (user.role === Role.SUPER_ADMIN) {
      return this.prisma.navItem.findMany({ orderBy: { order: 'asc' } });
    }
    if (user.role === Role.ADMIN) {
      return this.prisma.navItem.findMany({ where: baseWhere, orderBy: { order: 'asc' } });
    }
    // USER
    if (!user.departmentId) return [];
    const dept = await this.prisma.department.findUniqueOrThrow({ where: { id: user.departmentId } });
    return this.prisma.navItem.findMany({
      where: {
        ...baseWhere,
        isAdminNav: false,
        OR: [{ isAllDepts: true }, { id: { in: dept.navItemIds } }],
      },
      orderBy: { order: 'asc' },
    });
  }

  private async getAdminFeatures(
    user: { role: string },
    tenant: { package: Tenant['package'] } | null,
  ) {
    if (user.role === Role.USER) return [];
    const features = await this.prisma.adminFeature.findMany({ where: { status: Status.ACTIVE } });
    if (user.role === Role.SUPER_ADMIN) {
      return features.map((f) => ({ ...f, featureStatus: 'available' as const }));
    }
    const pkg = tenant!.package;
    return features.map((f) => ({
      ...f,
      featureStatus: (f.packages.includes(pkg) ? 'available' : 'locked') as 'available' | 'locked',
    }));
  }

  private sign(user: { id: string; tenantId: string | null; email: string; role: string }) {
    return this.jwt.sign({ sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role });
  }
}
