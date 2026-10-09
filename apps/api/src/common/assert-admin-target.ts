import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

// Shared by every admin-reads-another-user's-data endpoint (agent-chat admin routes, course
// lesson-views admin route). Looked up unconditionally for BOTH roles — not only inside an
// ADMIN branch — so a SUPER_ADMIN passing a nonexistent userId still gets a 404 instead of a
// silently empty result.
//
// A cross-tenant or Student target also resolves to 404, never 403: a 403 would tell an ADMIN
// "this id belongs to a real account, just not yours" — enough to enumerate valid ids across
// tenants by watching which ids 403 vs 404. Only SUPER_ADMIN (who has no tenant restriction, so
// this branch never applies to them) gets to see everyone; for ADMIN, "not mine" and "doesn't
// exist" must look identical.
export async function assertAdminCanAccessUser(
  prisma: PrismaService,
  actor: { role: Role; tenantId: string | null },
  targetUserId: string,
): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, tenantId: true },
  });
  if (!target) throw new NotFoundException();
  if (actor.role === Role.ADMIN && target.tenantId !== actor.tenantId) {
    throw new NotFoundException();
  }
}

// Same 404-not-403 rationale as above, but for an admin browsing an AiAgent's chat history
// instead of a User's. A tenant-scoped Agent (tenantId set) outside the ADMIN's own tenant 404s;
// a platform-wide Agent (tenantId: null, e.g. findPublishedAgents' shared-agent case) is visible
// to every ADMIN — the per-conversation user.tenantId filter the caller applies afterward is what
// keeps a platform-wide Agent's cross-tenant users' chats out of view, not this check.
export async function assertAdminCanAccessAgent(
  prisma: PrismaService,
  actor: { role: Role; tenantId: string | null },
  agentId: string,
): Promise<void> {
  const agent = await prisma.aiAgent.findUnique({
    where: { id: agentId },
    select: { id: true, tenantId: true },
  });
  if (!agent) throw new NotFoundException();
  if (
    actor.role === Role.ADMIN &&
    agent.tenantId !== null &&
    agent.tenantId !== actor.tenantId
  ) {
    throw new NotFoundException();
  }
}
