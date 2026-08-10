import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AgentChatService } from './agent-chat.service';

// Admin read of another user's chat history. Tenant/existence gating is covered separately by
// assertAdminCanAccessUser's own tests — this file covers the IDOR-safe query shape and the
// no-fetch-all projections these two methods are relied on for.
describe('AgentChatService admin reads', () => {
  function buildService() {
    const prisma = {
      agentConversation: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      agentMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AgentChatService(prisma as any, {} as any, {} as any);
    return { service, prisma };
  }

  it('findConversationsForUserAsAdmin scopes to the target userId and projects a message count, not the messages themselves', async () => {
    const { service, prisma } = buildService();
    await service.findConversationsForUserAsAdmin('user-1', {
      page: 1,
      pageSize: 10,
    });
    const args = prisma.agentConversation.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'user-1' });
    expect(args.select._count).toEqual({ select: { messages: true } });
    expect(args.select.messages).toBeUndefined();
  });

  // The IDOR guard: ownership is enforced by requiring BOTH conversation.id and
  // conversation.userId to match in the same where clause, not conversationId alone. A
  // mismatched conversationId must be able to return zero rows, not throw — the query itself is
  // the entire security boundary here.
  it('findMessagesForUserAsAdmin scopes by both conversationId and userId in the same where clause', async () => {
    const { service, prisma } = buildService();
    await service.findMessagesForUserAsAdmin('user-1', 'conversation-1', {
      page: 1,
      pageSize: 10,
    });
    const args = prisma.agentMessage.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      conversation: { id: 'conversation-1', userId: 'user-1' },
    });
  });

  it('findMessagesForUserAsAdmin orders newest-first (page 1 = most recent messages)', async () => {
    const { service, prisma } = buildService();
    await service.findMessagesForUserAsAdmin('user-1', 'conversation-1', {
      page: 1,
      pageSize: 10,
    });
    const args = prisma.agentMessage.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });
});

// Enrollment-gated access: an agent tied to a Course Series is gated by an Enrollment on that
// series; a series-less agent is gated by a direct Enrollment naming the agent itself.
// SUPER_ADMIN bypasses both. ADMIN/USER are held to the same bar as STUDENT (deliberately
// stricter than CoursesService.visibilityWhere, where ADMIN only needs a tenant match).
describe('AgentChatService enrollment gating', () => {
  function buildService(
    enrollmentRows: { seriesId: string | null; agentId: string | null }[] = [],
  ) {
    const prisma = {
      aiAgent: { findMany: jest.fn(), findFirstOrThrow: jest.fn() },
      agentConversation: { create: jest.fn() },
      enrollment: { findMany: jest.fn().mockResolvedValue(enrollmentRows) },
      user: { findUnique: jest.fn() },
    };
    const service = new AgentChatService(prisma as any, {} as any, {} as any);
    return { service, prisma };
  }

  describe('findPublishedAgents', () => {
    it('SUPER_ADMIN sees every agent as accessible with no Enrollment query at all', async () => {
      const { service, prisma } = buildService();
      prisma.aiAgent.findMany.mockResolvedValue([
        { id: 'agent-1', name: 'A', seriesId: null, status: 'DRAFT' },
      ]);
      const result = await service.findPublishedAgents(
        'admin-1',
        Role.SUPER_ADMIN,
        null,
      );
      expect(result[0].hasAccess).toBe(true);
      expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    });

    it('a STUDENT with no linked Student record is locked out of everything, not granted access', async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ studentId: null });
      prisma.aiAgent.findMany.mockResolvedValue([
        { id: 'agent-1', name: 'A', seriesId: 'series-1', status: 'PUBLISHED' },
      ]);
      const result = await service.findPublishedAgents(
        'student-1',
        Role.STUDENT,
        null,
      );
      expect(result[0].hasAccess).toBe(false);
      // Guards the exact bug courses.service.ts had to fix: a missing studentId must never reach
      // Prisma as `{ studentId: undefined }`, which would silently match every enrollment.
      expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    });

    it('a series-linked agent is accessible via a non-expired Enrollment on that series', async () => {
      const { service, prisma } = buildService([
        { seriesId: 'series-1', agentId: null },
      ]);
      prisma.user.findUnique.mockResolvedValue({ studentId: 'student-1' });
      prisma.aiAgent.findMany.mockResolvedValue([
        { id: 'agent-1', name: 'A', seriesId: 'series-1', status: 'PUBLISHED' },
        { id: 'agent-2', name: 'B', seriesId: 'series-2', status: 'PUBLISHED' },
      ]);
      const result = await service.findPublishedAgents(
        'student-1',
        Role.STUDENT,
        null,
      );
      expect(result.find((a) => a.id === 'agent-1')?.hasAccess).toBe(true);
      expect(result.find((a) => a.id === 'agent-2')?.hasAccess).toBe(false);
    });

    it('a series-less agent is accessible only via a direct Enrollment on the agent itself', async () => {
      const { service, prisma } = buildService([
        { seriesId: null, agentId: 'agent-1' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ studentId: 'student-1' });
      prisma.aiAgent.findMany.mockResolvedValue([
        { id: 'agent-1', name: 'A', seriesId: null, status: 'PUBLISHED' },
        { id: 'agent-2', name: 'B', seriesId: null, status: 'PUBLISHED' },
      ]);
      const result = await service.findPublishedAgents(
        'student-1',
        Role.STUDENT,
        null,
      );
      expect(result.find((a) => a.id === 'agent-1')?.hasAccess).toBe(true);
      expect(result.find((a) => a.id === 'agent-2')?.hasAccess).toBe(false);
    });

    it('ADMIN and USER are gated the same as STUDENT, via a tenant-wide Enrollment', async () => {
      const { service, prisma } = buildService([
        { seriesId: 'series-1', agentId: null },
      ]);
      prisma.aiAgent.findMany.mockResolvedValue([
        { id: 'agent-1', name: 'A', seriesId: 'series-1', status: 'PUBLISHED' },
      ]);
      const result = await service.findPublishedAgents(
        'admin-1',
        Role.ADMIN,
        'tenant-1',
      );
      expect(result[0].hasAccess).toBe(true);
      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
        }),
      );
      // Never resolves the assignee from studentId for a non-STUDENT role.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('an ADMIN/USER with no tenantId is locked out rather than defaulting to open access', async () => {
      const { service, prisma } = buildService();
      prisma.aiAgent.findMany.mockResolvedValue([
        { id: 'agent-1', name: 'A', seriesId: null, status: 'PUBLISHED' },
      ]);
      const result = await service.findPublishedAgents(
        'user-1',
        Role.USER,
        null,
      );
      expect(result[0].hasAccess).toBe(false);
      expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    });

    it('sorts accessible agents before locked ones', async () => {
      const { service, prisma } = buildService([
        { seriesId: null, agentId: 'agent-2' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ studentId: 'student-1' });
      prisma.aiAgent.findMany.mockResolvedValue([
        {
          id: 'agent-1',
          name: 'A (locked)',
          seriesId: null,
          status: 'PUBLISHED',
        },
        {
          id: 'agent-2',
          name: 'B (accessible)',
          seriesId: null,
          status: 'PUBLISHED',
        },
      ]);
      const result = await service.findPublishedAgents(
        'student-1',
        Role.STUDENT,
        null,
      );
      expect(result.map((a) => a.id)).toEqual(['agent-2', 'agent-1']);
    });
  });

  describe('createConversation', () => {
    it('rejects creating a conversation with an agent the caller has no Enrollment for', async () => {
      const { service, prisma } = buildService();
      prisma.aiAgent.findFirstOrThrow.mockResolvedValue({
        id: 'agent-1',
        status: 'PUBLISHED',
        seriesId: null,
      });
      await expect(
        service.createConversation('student-1', 'agent-1', Role.STUDENT, null),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.agentConversation.create).not.toHaveBeenCalled();
    });

    it('allows creating a conversation once a valid Enrollment exists', async () => {
      const { service, prisma } = buildService([
        { seriesId: null, agentId: 'agent-1' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ studentId: 'student-1' });
      prisma.aiAgent.findFirstOrThrow.mockResolvedValue({
        id: 'agent-1',
        status: 'PUBLISHED',
        seriesId: null,
      });
      prisma.agentConversation.create.mockResolvedValue({ id: 'conv-1' });
      await service.createConversation(
        'student-1',
        'agent-1',
        Role.STUDENT,
        null,
      );
      expect(prisma.agentConversation.create).toHaveBeenCalled();
    });

    it('SUPER_ADMIN can start a conversation with no Enrollment at all', async () => {
      const { service, prisma } = buildService();
      prisma.aiAgent.findFirstOrThrow.mockResolvedValue({
        id: 'agent-1',
        status: 'DRAFT',
        seriesId: null,
      });
      prisma.agentConversation.create.mockResolvedValue({ id: 'conv-1' });
      await service.createConversation(
        'admin-1',
        'agent-1',
        Role.SUPER_ADMIN,
        null,
      );
      expect(prisma.agentConversation.create).toHaveBeenCalled();
      expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    });
  });
});
