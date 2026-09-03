import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60_000;

type FailureEntry = { count: number; firstFailureAt: number };

@Injectable()
export class LarkApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(LarkApiKeyGuard.name);
  private readonly failuresByIp = new Map<string, FailureEntry>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip: string = request.ip ?? 'unknown';
    const providedKey = request.headers['x-api-key'];
    const expectedKey = process.env.LARK_API_KEY;
    const now = Date.now();

    const entry = this.failuresByIp.get(ip);
    if (entry && now - entry.firstFailureAt < LOCK_MS && entry.count >= MAX_FAILURES) {
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
    if (!entry || now - entry.firstFailureAt >= WINDOW_MS + LOCK_MS) {
      this.failuresByIp.set(ip, { count: 1, firstFailureAt: now });
    } else {
      entry.count += 1;
    }
  }
}
