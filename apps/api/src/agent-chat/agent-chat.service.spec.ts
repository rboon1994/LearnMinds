import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AgentChatService } from './agent-chat.service';

// Narrow, typed view onto the two private methods under test below — avoids `no-unsafe-call` from
// casting straight to `any` while still reaching past TypeScript's private-method visibility.
type PrivateTestMethods = {
  writeCodeInterpreterContainerId: (
    conversationId: string,
    previousValue: string | null,
    newContainerId: string,
  ) => Promise<string>;
  getConversationDocumentFileIds: (conversationId: string) => Promise<string[]>;
};

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

  it('findConversationsForAgentAsAdmin scopes to the agentId and projects a message count and the owning user, not the messages themselves', async () => {
    const { service, prisma } = buildService();
    await service.findConversationsForAgentAsAdmin(
      'agent-1',
      { role: Role.SUPER_ADMIN, tenantId: null },
      { page: 1, pageSize: 10 },
    );
    const args = prisma.agentConversation.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ agentId: 'agent-1', user: undefined });
    expect(args.select.user).toEqual({
      select: { id: true, fullName: true, email: true },
    });
    expect(args.select._count).toEqual({ select: { messages: true } });
    expect(args.select.messages).toBeUndefined();
  });

  // The cross-tenant leak this guards: a platform-wide Agent (tenantId: null) is visible to every
  // ADMIN, so without this filter an ADMIN could read another tenant's users' chat history simply
  // by browsing a shared Agent's conversations.
  it('findConversationsForAgentAsAdmin additionally scopes by the conversation owner tenantId for ADMIN, not SUPER_ADMIN', async () => {
    const { service, prisma } = buildService();
    await service.findConversationsForAgentAsAdmin(
      'agent-1',
      { role: Role.ADMIN, tenantId: 'tenant-a' },
      { page: 1, pageSize: 10 },
    );
    const args = prisma.agentConversation.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      agentId: 'agent-1',
      user: { tenantId: 'tenant-a' },
    });
  });

  it('findMessagesForAgentAsAdmin scopes by conversationId, agentId, and (for ADMIN) the owner tenantId in the same where clause', async () => {
    const { service, prisma } = buildService();
    await service.findMessagesForAgentAsAdmin(
      'agent-1',
      'conversation-1',
      { role: Role.ADMIN, tenantId: 'tenant-a' },
      { page: 1, pageSize: 10 },
    );
    const args = prisma.agentMessage.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      conversation: {
        id: 'conversation-1',
        agentId: 'agent-1',
        user: { tenantId: 'tenant-a' },
      },
    });
  });

  it('findAllMessagesForAgentAsAdmin scopes by agentId and (for ADMIN) the owner tenantId, unpaginated and ordered conversation-then-time', async () => {
    const { service, prisma } = buildService();
    await service.findAllMessagesForAgentAsAdmin('agent-1', {
      role: Role.ADMIN,
      tenantId: 'tenant-a',
    });
    const args = prisma.agentMessage.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      conversation: { agentId: 'agent-1', user: { tenantId: 'tenant-a' } },
    });
    expect(args.orderBy).toEqual([
      { conversationId: 'asc' },
      { createdAt: 'asc' },
    ]);
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
  });

  it('findAllMessagesForAgentAsAdmin does not scope by tenant for SUPER_ADMIN', async () => {
    const { service, prisma } = buildService();
    await service.findAllMessagesForAgentAsAdmin('agent-1', {
      role: Role.SUPER_ADMIN,
      tenantId: null,
    });
    const args = prisma.agentMessage.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      conversation: { agentId: 'agent-1', user: undefined },
    });
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

    // Needed by the web agents list to render a "filter by Speaker" control.
    it('selects the creator (Speaker) id and name alongside the agent fields', async () => {
      const { service, prisma } = buildService();
      prisma.aiAgent.findMany.mockResolvedValue([]);
      await service.findPublishedAgents('admin-1', Role.SUPER_ADMIN, null);
      const args = prisma.aiAgent.findMany.mock.calls[0][0];
      expect(args.select.creator).toEqual({ select: { id: true, name: true } });
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

describe('AgentChatService writeCodeInterpreterContainerId', () => {
  function buildService() {
    const prisma = {
      agentConversation: {
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    const openai = { deleteContainer: jest.fn() };
    const service = new AgentChatService(
      prisma as any,
      {} as any,
      openai as any,
    );
    return { service, prisma, openai };
  }

  it('returns the new id when the conditional update succeeds (no concurrent writer)', async () => {
    const { service, prisma, openai } = buildService();
    prisma.agentConversation.updateMany.mockResolvedValue({ count: 1 });
    const result = await (
      service as unknown as PrivateTestMethods
    ).writeCodeInterpreterContainerId('conv-1', null, 'cntr_new');
    expect(result).toBe('cntr_new');
    expect(prisma.agentConversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'conv-1', codeInterpreterContainerId: null },
      data: { codeInterpreterContainerId: 'cntr_new' },
    });
    expect(openai.deleteContainer).not.toHaveBeenCalled();
  });

  it('on a CAS conflict, deletes its own container and adopts the id another request won with', async () => {
    const { service, prisma, openai } = buildService();
    prisma.agentConversation.updateMany.mockResolvedValue({ count: 0 });
    prisma.agentConversation.findUniqueOrThrow.mockResolvedValue({
      codeInterpreterContainerId: 'cntr_winner',
    });
    const result = await (
      service as unknown as PrivateTestMethods
    ).writeCodeInterpreterContainerId('conv-1', null, 'cntr_loser');
    expect(result).toBe('cntr_winner');
    expect(openai.deleteContainer).toHaveBeenCalledWith('cntr_loser');
  });

  it('a failed cleanup delete does not stop the winner id from being returned', async () => {
    const { service, prisma, openai } = buildService();
    prisma.agentConversation.updateMany.mockResolvedValue({ count: 0 });
    prisma.agentConversation.findUniqueOrThrow.mockResolvedValue({
      codeInterpreterContainerId: 'cntr_winner',
    });
    openai.deleteContainer.mockRejectedValue(new Error('network blip'));
    const result = await (
      service as unknown as PrivateTestMethods
    ).writeCodeInterpreterContainerId('conv-1', null, 'cntr_loser');
    expect(result).toBe('cntr_winner');
  });
});

describe('AgentChatService getConversationDocumentFileIds', () => {
  it('returns openaiFileId for DOCUMENT attachments only, never IMAGE', async () => {
    const prisma = {
      agentAttachment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { openaiFileId: 'file-1' },
            { openaiFileId: 'file-2' },
          ]),
      },
    };
    const service = new AgentChatService(prisma as any, {} as any, {} as any);
    const ids = await (
      service as unknown as PrivateTestMethods
    ).getConversationDocumentFileIds('conv-1');
    expect(ids).toEqual(['file-1', 'file-2']);
    expect(prisma.agentAttachment.findMany).toHaveBeenCalledWith({
      where: {
        message: { conversationId: 'conv-1' },
        type: 'DOCUMENT',
        openaiFileId: { not: null },
      },
      select: { openaiFileId: true },
    });
  });
});

describe('AgentChatService sendMessage code_interpreter integration', () => {
  function buildService(
    overrides: {
      conversation?: any;
      documentFileIds?: string[];
      respondResult?: any;
      respondImpl?: () => Promise<any>;
    } = {},
  ) {
    const conversation = overrides.conversation ?? {
      id: 'conv-1',
      userId: 'user-1',
      codeInterpreterContainerId: null,
      agent: {
        status: 'PUBLISHED',
        systemPrompt: 'sys',
        model: {
          modelId: 'gpt-5.6',
          temperature: 1,
          inputTokenPrice: { toNumber: () => 1 },
          outputTokenPrice: { toNumber: () => 1 },
        },
        knowledgeBase: null,
      },
    };
    const prisma = {
      agentConversation: {
        findFirstOrThrow: jest.fn().mockResolvedValue(conversation),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
      },
      agentMessage: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'msg-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'user-msg-1', attachments: [] }),
        delete: jest.fn(),
      },
      agentAttachment: {
        findMany: jest.fn().mockResolvedValue(
          (overrides.documentFileIds ?? []).map((id) => ({
            openaiFileId: id,
          })),
        ),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn() },
    };
    const openai = {
      respond:
        overrides.respondImpl ??
        jest.fn().mockResolvedValue(
          overrides.respondResult ?? {
            text: 'done',
            inputTokens: 10,
            outputTokens: 10,
            fileSearchCalls: 0,
            codeInterpreterCalls: 0,
          },
        ),
      listContainerFiles: jest.fn().mockResolvedValue([]),
      downloadContainerFile: jest.fn(),
      deleteContainer: jest.fn(),
    };
    const storage = {
      root: 'C:\\fake-uploads',
      save: jest.fn(() => ({ key: 'k' })),
      delete: jest.fn(),
    };
    const service = new AgentChatService(
      prisma as any,
      storage as any,
      openai as any,
    );
    return { service, prisma, openai, storage };
  }

  it('does not attach code_interpreter when the conversation has no documents', async () => {
    const { service, openai } = buildService({ documentFileIds: [] });
    await service.sendMessage(
      'user-1',
      'conv-1',
      'hello',
      Role.SUPER_ADMIN,
      null,
      [],
      [],
      () => {},
      () => {},
    );
    const callArgs = (openai.respond as jest.Mock).mock.calls[0][0];
    expect(callArgs.codeInterpreter).toBeUndefined();
  });

  it('passes the conversation documents and existing containerId when documents exist', async () => {
    const { service, openai } = buildService({
      documentFileIds: ['file-1'],
      conversation: {
        id: 'conv-1',
        userId: 'user-1',
        codeInterpreterContainerId: 'cntr_existing',
        agent: {
          status: 'PUBLISHED',
          systemPrompt: 'sys',
          model: {
            modelId: 'gpt-5.6',
            temperature: 1,
            inputTokenPrice: { toNumber: () => 1 },
            outputTokenPrice: { toNumber: () => 1 },
          },
          knowledgeBase: null,
        },
      },
    });
    await service.sendMessage(
      'user-1',
      'conv-1',
      'hello',
      Role.SUPER_ADMIN,
      null,
      [],
      [],
      () => {},
      () => {},
    );
    const callArgs = (openai.respond as jest.Mock).mock.calls[0][0];
    expect(callArgs.codeInterpreter).toEqual({
      containerId: 'cntr_existing',
      documentFileIds: ['file-1'],
    });
  });

  it('retries once with no containerId when the first attempt reports an invalid container, then persists the new id via CAS', async () => {
    const invalidError = Object.assign(new Error('not found'), { status: 404 });
    const respondImpl = jest
      .fn()
      .mockRejectedValueOnce(invalidError)
      .mockResolvedValueOnce({
        text: 'done',
        inputTokens: 1,
        outputTokens: 1,
        fileSearchCalls: 0,
        codeInterpreterCalls: 1,
        containerId: 'cntr_rebuilt',
      });
    const { service, prisma } = buildService({
      documentFileIds: ['file-1'],
      conversation: {
        id: 'conv-1',
        userId: 'user-1',
        codeInterpreterContainerId: 'cntr_stale',
        agent: {
          status: 'PUBLISHED',
          systemPrompt: 'sys',
          model: {
            modelId: 'gpt-5.6',
            temperature: 1,
            inputTokenPrice: { toNumber: () => 1 },
            outputTokenPrice: { toNumber: () => 1 },
          },
          knowledgeBase: null,
        },
      },
      respondImpl,
    });
    await service.sendMessage(
      'user-1',
      'conv-1',
      'hello',
      Role.SUPER_ADMIN,
      null,
      [],
      [],
      () => {},
      () => {},
    );
    expect(respondImpl).toHaveBeenCalledTimes(2);
    expect(respondImpl.mock.calls[1][0].codeInterpreter).toEqual({
      containerId: undefined,
      documentFileIds: ['file-1'],
    });
    expect(prisma.agentConversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'conv-1', codeInterpreterContainerId: 'cntr_stale' },
      data: { codeInterpreterContainerId: 'cntr_rebuilt' },
    });
  });

  // Confirmed against a real production failure: a genuinely-expired container returns 400 with
  // this exact message, not 404 — the case the original isContainerInvalidStatus(status) check
  // missed entirely, since it only matched 404/410.
  it('also retries on a 400 "Container is expired." error, not just 404/410', async () => {
    const expiredError = Object.assign(new Error('Container is expired.'), {
      status: 400,
      openAiMessage: 'Container is expired.',
    });
    const respondImpl = jest
      .fn()
      .mockRejectedValueOnce(expiredError)
      .mockResolvedValueOnce({
        text: 'done',
        inputTokens: 1,
        outputTokens: 1,
        fileSearchCalls: 0,
        codeInterpreterCalls: 1,
        containerId: 'cntr_rebuilt',
      });
    const { service } = buildService({
      documentFileIds: ['file-1'],
      conversation: {
        id: 'conv-1',
        userId: 'user-1',
        codeInterpreterContainerId: 'cntr_stale',
        agent: {
          status: 'PUBLISHED',
          systemPrompt: 'sys',
          model: {
            modelId: 'gpt-5.6',
            temperature: 1,
            inputTokenPrice: { toNumber: () => 1 },
            outputTokenPrice: { toNumber: () => 1 },
          },
          knowledgeBase: null,
        },
      },
      respondImpl,
    });
    await service.sendMessage(
      'user-1',
      'conv-1',
      'hello',
      Role.SUPER_ADMIN,
      null,
      [],
      [],
      () => {},
      () => {},
    );
    expect(respondImpl).toHaveBeenCalledTimes(2);
    expect(respondImpl.mock.calls[1][0].codeInterpreter).toEqual({
      containerId: undefined,
      documentFileIds: ['file-1'],
    });
  });

  it('does NOT retry on an unrelated 400 error — must not mask a real bad request as a container problem', async () => {
    const badRequestError = Object.assign(
      new Error('Invalid value for model.'),
      {
        status: 400,
        openAiMessage: 'Invalid value for model.',
      },
    );
    const respondImpl = jest.fn().mockRejectedValue(badRequestError);
    const { service } = buildService({
      documentFileIds: ['file-1'],
      conversation: {
        id: 'conv-1',
        userId: 'user-1',
        codeInterpreterContainerId: 'cntr_stale',
        agent: {
          status: 'PUBLISHED',
          systemPrompt: 'sys',
          model: {
            modelId: 'gpt-5.6',
            temperature: 1,
            inputTokenPrice: { toNumber: () => 1 },
            outputTokenPrice: { toNumber: () => 1 },
          },
          knowledgeBase: null,
        },
      },
      respondImpl,
    });
    await expect(
      service.sendMessage(
        'user-1',
        'conv-1',
        'hello',
        Role.SUPER_ADMIN,
        null,
        [],
        [],
        () => {},
        () => {},
      ),
    ).rejects.toThrow('The AI agent failed to respond');
    expect(respondImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry on a transient (non-container) failure — surfaces it as a normal failure', async () => {
    const rateLimitError = Object.assign(new Error('rate limited'), {
      status: 429,
    });
    const respondImpl = jest.fn().mockRejectedValue(rateLimitError);
    const { service } = buildService({
      documentFileIds: ['file-1'],
      respondImpl,
    });
    await expect(
      service.sendMessage(
        'user-1',
        'conv-1',
        'hello',
        Role.SUPER_ADMIN,
        null,
        [],
        [],
        () => {},
        () => {},
      ),
    ).rejects.toThrow('The AI agent failed to respond');
    expect(respondImpl).toHaveBeenCalledTimes(1);
  });

  it('downloads every produced container file and creates one AgentAttachment each', async () => {
    const { service, openai, prisma } = buildService({
      documentFileIds: ['file-1'],
      respondResult: {
        text: 'done',
        inputTokens: 1,
        outputTokens: 1,
        fileSearchCalls: 0,
        codeInterpreterCalls: 1,
        containerId: 'cntr_new',
      },
    });
    openai.listContainerFiles.mockResolvedValue([
      { id: 'cfile-1', path: '/mnt/data/input.csv', source: 'user' },
      { id: 'cfile-2', path: '/mnt/data/report.xlsx', source: 'assistant' },
      { id: 'cfile-3', path: '/mnt/data/summary.xlsx', source: 'assistant' },
    ]);
    openai.downloadContainerFile.mockResolvedValue(Buffer.from('bytes'));
    await service.sendMessage(
      'user-1',
      'conv-1',
      'hello',
      Role.SUPER_ADMIN,
      null,
      [],
      [],
      () => {},
      () => {},
    );
    expect(openai.downloadContainerFile).toHaveBeenCalledTimes(2);
    expect(openai.downloadContainerFile).toHaveBeenCalledWith(
      'cntr_new',
      'cfile-2',
    );
    expect(openai.downloadContainerFile).toHaveBeenCalledWith(
      'cntr_new',
      'cfile-3',
    );
    const assistantCreateCall = prisma.agentMessage.create.mock.calls.find(
      (c: any) => c[0].data.role === 'ASSISTANT',
    );
    expect(
      assistantCreateCall[0].data.attachments.createMany.data,
    ).toHaveLength(2);
    expect(
      assistantCreateCall[0].data.attachments.createMany.data[0],
    ).toMatchObject({
      type: 'DOCUMENT',
    });
  });

  it('sets the correct mimeType per produced file extension, not just .xlsx', async () => {
    const { service, openai, prisma } = buildService({
      documentFileIds: ['file-1'],
      respondResult: {
        text: 'done',
        inputTokens: 1,
        outputTokens: 1,
        fileSearchCalls: 0,
        codeInterpreterCalls: 1,
        containerId: 'cntr_new',
      },
    });
    openai.listContainerFiles.mockResolvedValue([
      { id: 'cfile-1', path: '/mnt/data/chart.png', source: 'assistant' },
    ]);
    openai.downloadContainerFile.mockResolvedValue(Buffer.from('bytes'));
    await service.sendMessage(
      'user-1',
      'conv-1',
      'hello',
      Role.SUPER_ADMIN,
      null,
      [],
      [],
      () => {},
      () => {},
    );
    const assistantCreateCall = prisma.agentMessage.create.mock.calls.find(
      (c: any) => c[0].data.role === 'ASSISTANT',
    );
    expect(
      assistantCreateCall[0].data.attachments.createMany.data[0],
    ).toMatchObject({
      fileName: 'chart.png',
      mimeType: 'image/png',
    });
  });

  it('fires onStatus("generating_file") when OpenAiService reports code_interpreter starting', async () => {
    const { service, openai } = buildService({ documentFileIds: ['file-1'] });
    (openai.respond as jest.Mock).mockImplementation(
      (
        _params: unknown,
        _onDelta: unknown,
        onCodeInterpreterStart: (() => void) | undefined,
      ) => {
        onCodeInterpreterStart?.();
        return Promise.resolve({
          text: 'done',
          inputTokens: 1,
          outputTokens: 1,
          fileSearchCalls: 0,
          codeInterpreterCalls: 1,
        });
      },
    );
    const onStatus = jest.fn();
    await service.sendMessage(
      'user-1',
      'conv-1',
      'hello',
      Role.SUPER_ADMIN,
      null,
      [],
      [],
      () => {},
      onStatus,
    );
    expect(onStatus).toHaveBeenCalledWith('generating_file');
  });

  it('drops any .pdf code_interpreter produces — never downloaded, never attached', async () => {
    const { service, openai, prisma } = buildService({
      documentFileIds: ['file-1'],
      respondResult: {
        text: 'done',
        inputTokens: 1,
        outputTokens: 1,
        fileSearchCalls: 0,
        codeInterpreterCalls: 1,
        containerId: 'cntr_1',
      },
    });
    openai.listContainerFiles.mockResolvedValue([
      { id: 'cfile-pdf', path: '/mnt/data/report.pdf', source: 'assistant' },
      { id: 'cfile-xlsx', path: '/mnt/data/report.xlsx', source: 'assistant' },
    ]);
    openai.downloadContainerFile.mockResolvedValue(Buffer.from('bytes'));

    await service.sendMessage(
      'user-1',
      'conv-1',
      'hello',
      Role.SUPER_ADMIN,
      null,
      [],
      [],
      () => {},
      () => {},
    );

    // Only the .xlsx gets downloaded — the .pdf is skipped before downloadContainerFile is ever
    // called for it.
    expect(openai.downloadContainerFile).toHaveBeenCalledTimes(1);
    expect(openai.downloadContainerFile).toHaveBeenCalledWith(
      'cntr_1',
      'cfile-xlsx',
    );
    const assistantCreateCall = prisma.agentMessage.create.mock.calls.find(
      (c: any) => c[0].data.role === 'ASSISTANT',
    );
    expect(
      assistantCreateCall[0].data.attachments.createMany.data,
    ).toHaveLength(1);
    expect(
      assistantCreateCall[0].data.attachments.createMany.data[0],
    ).toMatchObject({ fileName: 'report.xlsx' });
  });
});
