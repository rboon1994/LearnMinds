import { Injectable, Logger } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type MembershipView = {
  id: string;
  tier: string;
  startDate: Date;
  endDate: Date;
  amount: number;
  status: MembershipStatus;
  createdAt: Date;
};

// Same lazy/throttled pattern as EventsService.closeExpiredSessions()
// (apps/api/src/events/events.service.ts) — throttles the write so read traffic never turns
// into a write-per-request. See the design spec's "Expiry" section for the accepted staleness
// limitation this implies for a user who never triggers a read path.
const CLOSE_EXPIRED_THROTTLE_MS = 60_000;

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);
  private lastClosedAt = 0;

  constructor(private prisma: PrismaService) {}

  async closeExpiredMemberships(): Promise<void> {
    const now = Date.now();
    if (now - this.lastClosedAt < CLOSE_EXPIRED_THROTTLE_MS) return;
    this.lastClosedAt = now;
    try {
      await this.prisma.membership.updateMany({
        where: { endDate: { lt: new Date() }, status: MembershipStatus.ACTIVE },
        data: { status: MembershipStatus.EXPIRED },
      });
    } catch (err) {
      this.logger.warn('Failed to close expired memberships', err as Error);
    }
  }

  async getMembershipsForUser(userId: string): Promise<MembershipView[]> {
    await this.closeExpiredMemberships();
    const rows = await this.prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      tier: row.tier,
      startDate: row.startDate,
      endDate: row.endDate,
      amount: row.amount.toNumber(),
      status: row.status,
      createdAt: row.createdAt,
    }));
  }

  // Distinct referred users, not raw row count — a referred user who renews produces a second
  // Membership row but is still one referral. Raw SQL (not findMany+distinct) so Postgres
  // returns a single number instead of materializing one row per distinct referred user in
  // Node. ::int avoids Postgres COUNT's default bigint (which Prisma surfaces as a non-
  // JSON-serializable BigInt).
  async getReferralCount(userId: string): Promise<number> {
    const [{ count }] = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT "userId")::int AS count
      FROM "Membership"
      WHERE "referredByUserId" = ${userId}
    `;
    return count;
  }
}
