import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Membership, Prisma, Role, Status } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TEMP_PASSWORD } from '../common/temp-password';
import {
  NON_MEMBER_TIER,
  resolveEffectiveStatus,
  shouldWriteTier,
} from '../memberships/membership-labels';
import type { LarkMembershipRecordDto } from './dto/lark-membership-record.dto';

@Injectable()
export class LarkSyncService {
  constructor(private prisma: PrismaService) {}

  async syncRecord(dto: LarkMembershipRecordDto): Promise<Membership | null> {
    const existing = await this.prisma.membership.findUnique({
      where: { larkRecordId: dto.larkRecordId },
    });

    // A never-seen larkRecordId reported as 非会员 is a no-op — nothing to create.
    if (!existing && dto.tier === NON_MEMBER_TIER) {
      return null;
    }

    const userId = existing
      ? await this.applyKnownUserEmail(existing.userId, dto)
      : await this.resolveOrCreateUser(dto);

    const incomingUpdatedAt = dto.larkUpdatedAt
      ? new Date(dto.larkUpdatedAt)
      : null;
    const isStale =
      existing?.larkUpdatedAt != null &&
      incomingUpdatedAt != null &&
      incomingUpdatedAt < existing.larkUpdatedAt;

    let membership: Membership;
    if (isStale) {
      membership = existing;
    } else {
      const effectiveStatus = resolveEffectiveStatus(dto.tier, dto.status);
      const tierField = shouldWriteTier(dto.tier) ? dto.tier : undefined;
      membership = await this.prisma.membership.upsert({
        where: { larkRecordId: dto.larkRecordId },
        create: {
          larkRecordId: dto.larkRecordId,
          userId,
          tier: dto.tier,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          amount: dto.amount,
          status: effectiveStatus,
          larkUpdatedAt: incomingUpdatedAt ?? undefined,
        },
        update: {
          tier: tierField,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          amount: dto.amount,
          status: effectiveStatus,
          larkUpdatedAt: incomingUpdatedAt ?? undefined,
        },
      });
    }

    await this.applyUserSyncedFields(userId, dto, incomingUpdatedAt);

    if (!membership.referredByUserId && dto.referredByEmail) {
      await this.resolveReferral(membership.id, dto.referredByEmail);
    }

    return membership;
  }

  // Used both here (single-record, graceful no-op fallback) and by LarkSyncService.syncBulk's
  // pass 2 (explicit re-attempt once every batch member exists).
  async resolveReferral(
    membershipId: string,
    referredByEmail: string,
  ): Promise<void> {
    const referrer = await this.prisma.user.findUnique({
      where: { email: referredByEmail },
    });
    if (!referrer) return; // self-heals on a later sync of the same larkRecordId
    await this.prisma.membership.update({
      where: { id: membershipId },
      data: { referredByUserId: referrer.id },
    });
  }

  private async resolveOrCreateUser(
    dto: LarkMembershipRecordDto,
  ): Promise<string> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) return existingUser.id;

    const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.create({ data: {} });
        return tx.user.create({
          data: {
            fullName: dto.fullName.trim(),
            email: dto.email,
            password: hashed,
            phoneCountryCode: dto.phoneCountryCode,
            phoneNo: dto.phoneNo,
            role: Role.STUDENT,
            studentId: student.id,
            mustChangePassword: true,
            status: Status.INACTIVE,
          },
        });
      });
      return created.id;
    } catch (err) {
      // Defense-in-depth against a residual cross-request race (e.g. a bulk-sync call and an
      // applications webhook landing for the same brand-new email at the same instant) — not a
      // lock, an optimistic-create-then-refetch.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const refetched = await this.prisma.user.findUnique({
          where: { email: dto.email },
        });
        if (refetched) return refetched.id;
      }
      throw err;
    }
  }

  private async applyKnownUserEmail(
    userId: string,
    dto: LarkMembershipRecordDto,
  ): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.email === dto.email) return userId;
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { email: dto.email },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Email already registered to a different account',
        );
      }
      throw err;
    }
    return userId;
  }

  // Handles every User-level field this sync carries (the 3 commission totals, plus
  // referralCode) behind one shared freshness guard — referralCode is a Lark-sourced,
  // User-level aggregate exactly like the commission fields (arrives on the same payload,
  // no per-Membership-row meaning of its own), so it gets no freshness guard of its own; it
  // rides the same commissionSyncedAt check. Also guards the referralCode write's @unique
  // constraint the same way applyKnownUserEmail guards email's — a raw P2002 here would
  // otherwise surface as an unhandled 500 on the single-record endpoints instead of a clean 409.
  private async applyUserSyncedFields(
    userId: string,
    dto: LarkMembershipRecordDto,
    incomingUpdatedAt: Date | null,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const isStale =
      user.commissionSyncedAt != null &&
      incomingUpdatedAt != null &&
      incomingUpdatedAt < user.commissionSyncedAt;
    if (isStale) return;

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          pendingCommission: dto.pendingCommission,
          approvedCommission: dto.approvedCommission,
          totalCommission: dto.totalCommission,
          commissionSyncedAt: incomingUpdatedAt ?? undefined,
          ...(dto.referralCode ? { referralCode: dto.referralCode } : {}),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Referral code already assigned to a different account',
        );
      }
      throw err;
    }
  }
}
