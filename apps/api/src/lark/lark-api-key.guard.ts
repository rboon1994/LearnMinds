import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 60_000; // ponytail: sweep at most once per minute

type FailureEntry = {
  count: number;
  firstFailureAt: number;
  lockedAt?: number;
};

@Injectable()
export class LarkApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(LarkApiKeyGuard.name);
  private readonly failuresByIp = new Map<string, FailureEntry>();
  private lastSweepAt: number = 0;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip: string = request.ip ?? 'unknown';
    const providedKey = request.headers['x-api-key'];
    const expectedKey = process.env.LARK_API_KEY;
    const now = Date.now();

    this.sweepStaleEntries(now);

    const entry = this.failuresByIp.get(ip);
    if (entry && entry.lockedAt != null && now - entry.lockedAt < LOCK_MS) {
      this.logger.warn(`Lark API request blocked (rate-limited): ${ip}`);
      throw new UnauthorizedException('Too many failed attempts');
    }

    if (!expectedKey || providedKey !== expectedKey) {
      this.recordFailure(ip, now);
      this.logger.warn(`Lark API request rejected (invalid key): ${ip}`);
      throw new UnauthorizedException('Invalid API key');
    }

    this.failuresByIp.delete(ip);
    return true;
  }

  private recordFailure(ip: string, now: number) {
    const entry = this.failuresByIp.get(ip);
    if (!entry) {
      this.failuresByIp.set(ip, { count: 1, firstFailureAt: now });
    } else {
      // Check if entry is stale using consistent anchoring logic
      const staleThreshold = entry.lockedAt ? LOCK_MS : WINDOW_MS + LOCK_MS;
      const anchor = entry.lockedAt ?? entry.firstFailureAt;
      if (now - anchor >= staleThreshold) {
        // Reset: create a fresh entry
        this.failuresByIp.set(ip, { count: 1, firstFailureAt: now });
      } else {
        entry.count += 1;
        if (entry.count === MAX_FAILURES) {
          entry.lockedAt = now;
        }
      }
    }
  }

  private sweepStaleEntries(now: number) {
    if (now - this.lastSweepAt < SWEEP_INTERVAL_MS) {
      return;
    }
    this.lastSweepAt = now;
    for (const [ip, entry] of this.failuresByIp.entries()) {
      // Use consistent anchoring logic: locked entries expire based on lockedAt, unlocked based on firstFailureAt
      const staleThreshold = entry.lockedAt ? LOCK_MS : WINDOW_MS + LOCK_MS;
      const anchor = entry.lockedAt ?? entry.firstFailureAt;
      if (now - anchor >= staleThreshold) {
        this.failuresByIp.delete(ip);
      }
    }
  }
}
