import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from '../openai/openai.service';

// Fixed message-count cap, not real token counting — simple and bounds both the
// 400-from-context-overflow risk and runaway cost. Upgrade to a tiktoken-based budget if a
// conversation's individual messages turn out to be large enough that this still overflows.
const MAX_HISTORY_MESSAGES = 50;

@Injectable()
export class AgentChatService {
  constructor(
    private prisma: PrismaService,
    private openai: OpenAiService,
  ) {}

  findPublishedAgents() {
    return this.prisma.aiAgent.findMany({
      where: { status: 'PUBLISHED', tenantId: null },
      select: { id: true, name: true, description: true, thumbnail: true },
      orderBy: { name: 'asc' },
    });
  }

  // Garbage-collects empty threads (started via "Start Chat" but abandoned before a first
  // message) every time the list is loaded — mirrors WhatsApp never listing a chat you haven't
  // actually messaged in. activeConversationId is excluded so the thread the caller is currently
  // viewing survives even if it has no messages yet.
  async findConversations(userId: string, activeConversationId?: string) {
    await this.prisma.agentConversation.deleteMany({
      where: {
        userId,
        id: activeConversationId ? { not: activeConversationId } : undefined,
        messages: { none: {} },
      },
    });
    const conversations = await this.prisma.agentConversation.findMany({
      where: { userId },
      include: {
        agent: {
          select: { id: true, name: true, thumbnail: true, instructions: true },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      agent: c.agent,
      lastMessage: c.messages[0] ?? null,
      updatedAt: c.updatedAt,
    }));
  }

  // Always creates a new thread — no upsert/lookup-existing — a user can have several
  // simultaneous threads with the same agent. title stays null until the user renames it —
  // callers display the agent's name as the fallback (see renameConversation below).
  async createConversation(userId: string, agentId: string) {
    const agent = await this.prisma.aiAgent.findFirstOrThrow({
      where: { id: agentId, tenantId: null },
    });
    if (agent.status !== 'PUBLISHED') {
      throw new ForbiddenException('This agent is not published');
    }
    return this.prisma.agentConversation.create({
      data: { agentId, userId },
    });
  }

  async renameConversation(
    userId: string,
    conversationId: string,
    title: string,
  ) {
    await this.prisma.agentConversation.findFirstOrThrow({
      where: { id: conversationId, userId },
    });
    const trimmed = title.trim();
    return this.prisma.agentConversation.update({
      where: { id: conversationId },
      data: { title: trimmed === '' ? null : trimmed },
    });
  }

  async findMessages(userId: string, conversationId: string) {
    const conversation = await this.prisma.agentConversation.findFirstOrThrow({
      where: { id: conversationId, userId },
    });
    return this.prisma.agentMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(userId: string, conversationId: string, content: string) {
    const conversation = await this.prisma.agentConversation.findFirstOrThrow({
      where: { id: conversationId, userId },
      include: { agent: { include: { model: true, knowledgeBase: true } } },
    });
    // Re-checked on every send, not just at conversation-creation time — an agent an admin
    // reverts to DRAFT stops answering existing threads immediately.
    if (conversation.agent.status !== 'PUBLISHED') {
      throw new ForbiddenException('This agent is not published');
    }

    const userMessage = await this.prisma.agentMessage.create({
      data: { conversationId, role: 'USER', content },
    });

    const priorMessages = await this.prisma.agentMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    const truncated = priorMessages.slice(-MAX_HISTORY_MESSAGES);

    let reply: string;
    try {
      reply = await this.openai.respond({
        model: conversation.agent.model.modelId,
        systemPrompt: conversation.agent.systemPrompt,
        // instructions is shown to the student in the chat UI ("how to use this agent") — it's
        // never sent to OpenAI, only systemPrompt is.
        history: truncated.map((m) => ({
          role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
          content: m.content,
        })),
        vectorStoreId: conversation.agent.knowledgeBase?.vectorStoreId,
        // maxTokenLimit is a context/pricing-tier figure (shown next to token prices in the
        // admin UI), not a per-response completion cap — it isn't forwarded as
        // OpenAI's max_output_tokens, which is a different, narrower limit.
        temperature: conversation.agent.model.temperature,
      });
    } catch {
      try {
        // Roll back the just-created user message — the frontend never optimistically renders
        // it before the request settles, so deleting it keeps the conversation consistent with
        // what the user actually sees, instead of leaving an orphaned turn with no reply.
        await this.prisma.agentMessage.delete({
          where: { id: userMessage.id },
        });
      } catch {
        // Best-effort rollback — if even the cleanup delete fails, still report the original
        // failure below rather than letting this secondary error mask it.
      }
      throw new BadGatewayException(
        'The AI agent failed to respond — please try again',
      );
    }

    const assistantMessage = await this.prisma.agentMessage.create({
      data: { conversationId, role: 'ASSISTANT', content: reply },
    });
    await this.prisma.agentConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return { userMessage, assistantMessage };
  }
}
