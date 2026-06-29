import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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

  private sign(user: { id: string; tenantId: string; email: string; role: string }) {
    return this.jwt.sign({ sub: user.id, tenantId: user.tenantId, email: user.email, role: user.role });
  }
}
