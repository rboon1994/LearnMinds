import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Like JwtAuthGuard, but never blocks the request — attaches req.user when a valid Bearer
// token is present, leaves it undefined otherwise (missing/invalid/expired token). For routes
// that must stay reachable with no auth at all but should behave differently for a caller who
// happens to be authenticated (e.g. GET /events showing Draft events to a SUPER_ADMIN caller
// while staying public for everyone else). Pair with @Public() so the global JwtAuthGuard
// doesn't block first — this guard runs after it and does the actual optional token parsing.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: unknown): TUser {
    return (user || undefined) as TUser;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    return true;
  }
}
