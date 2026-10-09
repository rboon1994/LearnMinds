import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';
import * as XLSX from 'xlsx';
import { assertAdminCanAccessUser } from '../common/assert-admin-target';
import { paginate } from '../common/paginate';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  OpenAiService,
  isContainerInvalidError,
} from '../openai/openai.service';

// Fixed message-count cap, not real token counting — simple and bounds both the
// 400-from-context-overflow risk and runaway cost. Upgrade to a tiktoken-based budget if a
// conversation's individual messages turn out to be large enough that this still overflows.
const MAX_HISTORY_MESSAGES = 50;

// Flat OpenAI platform rate ($2.50 / 1000 calls) — not a per-model AiAgentModel price, since
// every model is charged the same for the file_search tool itself.
const FILE_SEARCH_COST_PER_CALL = 2.5 / 1000;

// code_interpreter's cheapest container tier's 5-minute billing minimum (2026-06 per-minute
// pricing: $0.03 / 20-minute session at the 1GB tier ⇒ $0.0015/min × 5min floor). Charged once,
// only on the message that created/rebuilt the container — see codeInterpreterCalls comment in
// schema.prisma. This UNDER-estimates real cost if the container is reused multiple times within
// its idle window for longer than 5 minutes total — a known, one-directional approximation (spec
// "成本考量"), not a bug if a later audit finds OpenAI's bill running higher than this sum.
const CODE_INTERPRETER_MINIMUM_CHARGE_USD = 0.0075;

// File types code_interpreter is documented to produce (images, CSVs, plus the .xlsx confirmed
// in production) — anything else falls back to a generic octet-stream, which still downloads
// fine but loses the browser's native icon/inline-preview for that type. .pdf is deliberately
// absent: PDF generation is disabled (see CODE_INTERPRETER_DISALLOWED_EXTENSIONS below).
const CODE_INTERPRETER_OUTPUT_MIME_TYPES: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

// PDF generation is disabled — reportlab's CJK font support proved unreliable across
// generations for structured reports (see CODE_INTERPRETER_CJK_FONT_HINT in openai.service.ts).
// That prompt-level instruction alone isn't a hard guarantee the model won't try anyway, so any
// .pdf a turn produces is dropped here regardless — never downloaded, never attached.
const CODE_INTERPRETER_DISALLOWED_EXTENSIONS = new Set(['.pdf']);

// OpenAI file_search-supported extensions (same allowlist as Knowledge Base), plus .csv/.xlsx/
// .xls — none of these three are natively accepted by OpenAI's vector-store attach endpoint
// (confirmed against the real API: "not supported for retrieval"), so sendMessage() re-encodes
// them before upload — .csv as a same-content .txt rename, .xlsx/.xls converted to text via the
// `xlsx` package (installed from SheetJS's own CDN, not the vulnerable/unmaintained npm-registry
// copy — see package.json). Legacy .ppt is excluded on purpose: only .pptx is supported.
export const ALLOWED_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.pptx',
  '.txt',
  '.md',
  '.json',
  '.html',
  '.csv',
  '.xlsx',
  '.xls',
];
// Extensions that reach OpenAI as a converted/renamed .txt rather than their original bytes.
const REENCODED_AS_TEXT_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);
// OpenAI vision-supported image formats.
export const ALLOWED_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
];
export const MAX_DOCUMENTS_PER_MESSAGE = 5;
export const MAX_IMAGES_PER_MESSAGE = 5;
export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;
// Multer's fileSize limit is one number shared across every field on a single interceptor, so
// the controller's multer config uses the larger (document) ceiling above; this tighter image
// cap is re-checked here once the upload is split out by fieldname.
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

type AttachmentInput = {
  type: 'DOCUMENT' | 'IMAGE';
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  openaiFileId: string | null;
};

@Injectable()
export class AgentChatService {
  private readonly logger = new Logger(AgentChatService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private openai: OpenAiService,
  ) {}

  // SUPER_ADMIN also sees DRAFT agents (to preview/test before publishing) — everyone else
  // only ever sees PUBLISHED ones, mirroring CoursesService.findBrowsable's actor split.
  async findPublishedAgents(
    userId: string,
    role: Role,
    tenantId: string | null,
  ) {
    const agents = await this.prisma.aiAgent.findMany({
      where: {
        tenantId: null,
        status: role === Role.SUPER_ADMIN ? undefined : 'PUBLISHED',
      },
      select: {
        id: true,
        name: true,
        description: true,
        thumbnail: true,
        status: true,
        seriesId: true,
        creator: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    const accessible = await this.resolveAccessibleAgentTargets(
      userId,
      role,
      tenantId,
    );
    return agents
      .map((agent) => ({
        ...agent,
        hasAccess: this.agentIsAccessible(agent, accessible),
      }))
      .sort((a, b) => Number(b.hasAccess) - Number(a.hasAccess));
  }

  // Garbage-collects empty threads (started via "Start Chat" but abandoned before a first
  // message) every time the list is loaded — mirrors WhatsApp never listing a chat you haven't
  // actually messaged in. activeConversationId is excluded so the thread the caller is currently
  // viewing survives even if it has no messages yet.
  async findConversations(
    userId: string,
    role: Role,
    tenantId: string | null,
    activeConversationId?: string,
  ) {
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
          select: {
            id: true,
            name: true,
            thumbnail: true,
            instructions: true,
            seriesId: true,
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const accessible = await this.resolveAccessibleAgentTargets(
      userId,
      role,
      tenantId,
    );
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      agent: c.agent,
      hasAccess: this.agentIsAccessible(c.agent, accessible),
      lastMessage: c.messages[0] ?? null,
      updatedAt: c.updatedAt,
    }));
  }

  // Always creates a new thread — no upsert/lookup-existing — a user can have several
  // simultaneous threads with the same agent. title stays null until the user renames it —
  // callers display the agent's name as the fallback (see renameConversation below).
  async createConversation(
    userId: string,
    agentId: string,
    role: Role,
    tenantId: string | null,
  ) {
    const agent = await this.prisma.aiAgent.findFirstOrThrow({
      where: { id: agentId, tenantId: null },
    });
    if (agent.status !== 'PUBLISHED' && role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('This agent is not published');
    }
    const accessible = await this.resolveAccessibleAgentTargets(
      userId,
      role,
      tenantId,
    );
    if (!this.agentIsAccessible(agent, accessible)) {
      throw new ForbiddenException('You do not have access to this agent');
    }
    return this.prisma.agentConversation.create({
      data: { agentId, userId },
    });
  }

  // Resolves which Enrollment "assignee" column applies to this caller — STUDENT enrollments key
  // on Student.id, everyone else's on Tenant.id. studentId isn't in the JWT (same gap
  // courses.service.ts already has to work around), so it's looked up once here; Prisma silently
  // drops an `undefined` filter key and would otherwise match everything, so a missing
  // studentId/tenantId returns null rather than an empty-object filter.
  private async resolveAssigneeFilter(
    userId: string,
    role: Role,
    tenantId: string | null,
  ) {
    if (role === Role.STUDENT) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { studentId: true },
      });
      return user?.studentId ? { studentId: user.studentId } : null;
    }
    return tenantId ? { tenantId } : null;
  }

  // Batched (one Enrollment query total, not one per agent) — mirrors CoursesService.findBrowsable's
  // enrolledSeriesIds/enrolledCourseIds two-Set pattern. SUPER_ADMIN bypasses entirely.
  private async resolveAccessibleAgentTargets(
    userId: string,
    role: Role,
    tenantId: string | null,
  ) {
    if (role === Role.SUPER_ADMIN) return 'ALL' as const;
    const assignee = await this.resolveAssigneeFilter(userId, role, tenantId);
    if (!assignee)
      return { seriesIds: new Set<string>(), agentIds: new Set<string>() };
    const now = new Date();
    const rows = await this.prisma.enrollment.findMany({
      where: {
        ...assignee,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: [{ seriesId: { not: null } }, { agentId: { not: null } }] },
        ],
      },
      select: { seriesId: true, agentId: true },
    });
    return {
      seriesIds: new Set(
        rows.map((r) => r.seriesId).filter((v): v is string => v !== null),
      ),
      agentIds: new Set(
        rows.map((r) => r.agentId).filter((v): v is string => v !== null),
      ),
    };
  }

  private agentIsAccessible(
    agent: { id: string; seriesId: string | null },
    accessible: Awaited<
      ReturnType<AgentChatService['resolveAccessibleAgentTargets']>
    >,
  ) {
    if (accessible === 'ALL') return true;
    return agent.seriesId
      ? accessible.seriesIds.has(agent.seriesId)
      : accessible.agentIds.has(agent.id);
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
      include: { attachments: true },
    });
  }

  // Authenticated download for a message attachment — ownership checked through the message's
  // conversation, never a bare static file (mirrors CourseFilesService.getDownloadable). An
  // admin inspecting another user's conversation (findMessagesForUserAsAdmin) can also download
  // that user's attachments, re-checked here via assertAdminCanAccessUser rather than trusting
  // a caller-supplied target id.
  async getAttachmentDownload(
    actor: { userId: string; role: Role; tenantId: string | null },
    attachmentId: string,
  ) {
    const attachment = await this.prisma.agentAttachment.findFirstOrThrow({
      where: { id: attachmentId },
      include: { message: { include: { conversation: true } } },
    });
    const ownerUserId = attachment.message.conversation.userId;
    if (ownerUserId !== actor.userId) {
      if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
        throw new NotFoundException();
      }
      await assertAdminCanAccessUser(this.prisma, actor, ownerUserId);
    }
    return {
      path: this.storage.resolvePath(attachment.fileUrl),
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    content: string | undefined,
    role: Role,
    tenantId: string | null,
    documents: Express.Multer.File[],
    images: Express.Multer.File[],
    onDelta: (text: string) => void,
    // Fired once right before the OpenAI call that generates the reply — the frontend uses it to
    // switch its placeholder bubble from "Uploading…" to "Thinking…" (or "Generating file…" if
    // code_interpreter starts mid-call), since everything before this point (upload, OpenAI file
    // sync, vector store indexing) is now genuinely done.
    onStatus: (phase: 'thinking' | 'generating_file') => void,
  ) {
    const trimmedContent = content?.trim() ?? '';
    const allFiles = [...documents, ...images];
    if (!trimmedContent && allFiles.length === 0) {
      await this.cleanupLocalFiles(allFiles);
      throw new BadRequestException(
        'Message must include text or an attachment',
      );
    }
    const oversizedImage = images.find((f) => f.size > MAX_IMAGE_SIZE_BYTES);
    if (oversizedImage) {
      await this.cleanupLocalFiles(allFiles);
      throw new BadRequestException(
        `Image "${oversizedImage.originalname}" exceeds the ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB limit`,
      );
    }

    let conversation: Awaited<ReturnType<AgentChatService['loadConversation']>>;
    try {
      conversation = await this.loadConversation(conversationId, userId);
    } catch (err) {
      await this.cleanupLocalFiles(allFiles);
      throw err;
    }
    // Re-checked on every send, not just at conversation-creation time — an agent an admin
    // reverts to DRAFT stops answering existing threads immediately. SUPER_ADMIN is exempt
    // (preview/test a DRAFT agent), scoped to their own conversations by the userId filter above.
    if (
      conversation.agent.status !== 'PUBLISHED' &&
      role !== Role.SUPER_ADMIN
    ) {
      await this.cleanupLocalFiles(allFiles);
      throw new ForbiddenException('This agent is not published');
    }
    // Re-checked on every send too — an admin revoking the Enrollment (or expiresAt passing)
    // must stop new sends immediately, while findMessages/getAttachmentDownload stay
    // ownership-only so existing history remains readable forever (the "read-only after expiry"
    // behavior falls out of this split for free, no extra code needed there).
    const accessible = await this.resolveAccessibleAgentTargets(
      userId,
      role,
      tenantId,
    );
    if (!this.agentIsAccessible(conversation.agent, accessible)) {
      await this.cleanupLocalFiles(allFiles);
      throw new ForbiddenException('You do not have access to this agent');
    }

    // Documents sync to this conversation's own (isolated, lazily-created) vector store before
    // any DB row exists — never the shared AiAgent-level KnowledgeBase — so an upload failure
    // only needs to unwind the OpenAI resources this loop itself created, not a half-written
    // message. Images never touch the Files API at all: they're read from disk and sent inline
    // as vision input further down, only on this one turn.
    let conversationVectorStoreId = conversation.vectorStoreId;
    const hadVectorStoreBefore = conversationVectorStoreId != null;
    const documentAttachments: AttachmentInput[] = [];
    const uploadedOpenAiFileIds: string[] = [];
    try {
      if (documents.length > 0) {
        conversationVectorStoreId ??=
          await this.ensureConversationVectorStore(conversationId);
        for (const file of documents) {
          const { key } = this.storage.save(file.path);
          const openaiFileId = await this.uploadDocumentToOpenAi(file);
          uploadedOpenAiFileIds.push(openaiFileId);
          await this.openai.attachFileToVectorStore(
            conversationVectorStoreId,
            openaiFileId,
          );
          // Attaching only queues the file for indexing — without this, a reply generated
          // immediately after can search a vector store that hasn't finished embedding the
          // file yet and report nothing found, even though the upload itself succeeded.
          await this.openai.waitForVectorStoreFileReady(
            conversationVectorStoreId,
            openaiFileId,
          );
          documentAttachments.push({
            type: 'DOCUMENT',
            fileName: this.decodeFileName(file.originalname),
            fileUrl: key,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            openaiFileId,
          });
        }
      }
    } catch (err) {
      this.logger.error('Failed to sync attachment to OpenAI', err as Error);
      if (!hadVectorStoreBefore) {
        await this.cleanupVectorStore(conversationVectorStoreId);
      }
      await this.cleanupOpenAiFiles(uploadedOpenAiFileIds);
      await this.cleanupLocalFiles(allFiles);
      throw new BadGatewayException(
        'Failed to process attachment — please try again',
      );
    }

    const imageAttachments: AttachmentInput[] = images.map((file) => ({
      type: 'IMAGE',
      fileName: this.decodeFileName(file.originalname),
      fileUrl: this.storage.save(file.path).key,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      openaiFileId: null,
    }));

    const userMessage = await this.prisma.agentMessage.create({
      data: {
        conversationId,
        role: 'USER',
        content: trimmedContent,
        attachments: {
          createMany: { data: [...documentAttachments, ...imageAttachments] },
        },
      },
    });

    const priorMessages = await this.prisma.agentMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    const truncated = priorMessages.slice(-MAX_HISTORY_MESSAGES);

    // Documents are grounded via file_search regardless of history truncation — the vector
    // store is queried fresh every turn, so a file attached 60 messages ago is still findable
    // even once its original upload message has aged out of `truncated` above.
    const vectorStoreIds = [
      conversation.agent.knowledgeBase?.vectorStoreId,
      conversationVectorStoreId,
    ].filter((id): id is string => Boolean(id));

    let currentImages: { base64: string; mimeType: string }[] | undefined;
    if (images.length > 0) {
      currentImages = await Promise.all(
        images.map(async (file) => ({
          base64: (await readFile(file.path)).toString('base64'),
          mimeType: file.mimetype,
        })),
      );
    }

    onStatus('thinking');

    // Every document this conversation has ever uploaded — mounted into code_interpreter's
    // container whenever there's at least one, so the model can analyze/transform it, not just
    // search it via file_search.
    const documentFileIds =
      await this.getConversationDocumentFileIds(conversationId);
    const buildRespondParams = (containerId: string | undefined) => ({
      model: conversation.agent.model.modelId,
      systemPrompt: conversation.agent.systemPrompt,
      // instructions is shown to the student in the chat UI ("how to use this agent") —
      // it's never sent to OpenAI, only systemPrompt is.
      history: truncated.map((m) => ({
        role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      })),
      currentImages,
      vectorStoreIds: vectorStoreIds.length > 0 ? vectorStoreIds : undefined,
      // maxTokenLimit is a context/pricing-tier figure (shown next to token prices in the
      // admin UI), not a per-response completion cap — it isn't forwarded as
      // OpenAI's max_output_tokens, which is a different, narrower limit.
      temperature: conversation.agent.model.temperature,
      codeInterpreter:
        documentFileIds.length > 0
          ? { containerId, documentFileIds }
          : undefined,
    });

    let reply: {
      text: string;
      inputTokens: number;
      outputTokens: number;
      fileSearchCalls: number;
      codeInterpreterCalls: number;
      containerId?: string;
    };
    try {
      try {
        reply = await this.openai.respond(
          buildRespondParams(
            conversation.codeInterpreterContainerId ?? undefined,
          ),
          onDelta,
          () => onStatus('generating_file'),
        );
      } catch (err) {
        // Only a stale/expired containerId is retried, and only by rebuilding via `auto` — a
        // rate-limit/timeout/server error here must fall straight through to the outer catch
        // instead of being mistaken for a container problem (that would trigger an unnecessary,
        // separately-billed container rebuild for a failure that had nothing to do with it).
        const errInfo = err as { status?: number; openAiMessage?: string };
        if (
          conversation.codeInterpreterContainerId &&
          isContainerInvalidError(errInfo)
        ) {
          this.logger.warn(
            `Code interpreter container ${conversation.codeInterpreterContainerId} invalid, rebuilding`,
            err as Error,
          );
          reply = await this.openai.respond(
            buildRespondParams(undefined),
            onDelta,
            () => onStatus('generating_file'),
          );
        } else {
          throw err;
        }
      }
    } catch (err) {
      this.logger.error('OpenAI failed to respond', err as Error);
      try {
        // Roll back the just-created user message (cascades its AgentAttachment rows) — the
        // frontend never optimistically renders it before the request settles, so deleting it
        // keeps the conversation consistent with what the user actually sees, instead of
        // leaving an orphaned turn with no reply.
        await this.prisma.agentMessage.delete({
          where: { id: userMessage.id },
        });
      } catch {
        // Best-effort rollback — if even the cleanup delete fails, still report the original
        // failure below rather than letting this secondary error mask it.
      }
      // The message never actually happened from the user's point of view, so nothing it
      // uploaded should survive either — same "only keep files behind a successful message"
      // rule the local-disk copies follow everywhere else in this method.
      if (!hadVectorStoreBefore) {
        await this.cleanupVectorStore(conversationVectorStoreId);
      }
      await this.cleanupOpenAiFiles(uploadedOpenAiFileIds);
      await this.cleanupLocalFiles(allFiles);
      // A container that failed outright (rather than succeeding-then-losing-a-CAS-race) never
      // hands back an id we could clean up — the request itself failed before returning one.
      // Left to OpenAI's own idle timeout, same bounded/self-expiring reasoning as the CAS-loser
      // cleanup path in writeCodeInterpreterContainerId above.
      throw new BadGatewayException(
        'The AI agent failed to respond — please try again',
      );
    }

    // Persist the container id this turn used/created via the same CAS path regardless of
    // whether it came from a first-time create, a plain reuse, or an invalid-container rebuild —
    // one write path, no separate branches (spec "数据流" step 7). Skipped entirely when this
    // turn never touched code_interpreter at all.
    if (reply.containerId) {
      await this.writeCodeInterpreterContainerId(
        conversationId,
        conversation.codeInterpreterContainerId,
        reply.containerId,
      );
    }

    // Download every file code_interpreter produced this turn (not the ones we uploaded as
    // input) before creating the assistant message, so a download failure rolls back cleanly the
    // same way an OpenAI-call failure does above, rather than leaving a message that references a
    // file nobody could fetch.
    let generatedAttachments: AttachmentInput[] = [];
    if (reply.containerId && reply.codeInterpreterCalls > 0) {
      try {
        generatedAttachments = await this.downloadCodeInterpreterOutputFiles(
          reply.containerId,
        );
      } catch (err) {
        this.logger.error(
          'Failed to download code_interpreter output file',
          err as Error,
        );
        try {
          await this.prisma.agentMessage.delete({
            where: { id: userMessage.id },
          });
        } catch {
          // Best-effort rollback.
        }
        if (!hadVectorStoreBefore) {
          await this.cleanupVectorStore(conversationVectorStoreId);
        }
        await this.cleanupOpenAiFiles(uploadedOpenAiFileIds);
        await this.cleanupLocalFiles(allFiles);
        throw new BadGatewayException(
          'The AI agent failed to respond — please try again',
        );
      }
    }

    // Token prices are $ per 1M tokens (see AiAgentModel.inputTokenPrice/outputTokenPrice);
    // file_search is a flat platform rate, not model-specific. Both computed once here from
    // whatever's true right now, not recomputed later if prices change afterward.
    const costUsd =
      (reply.inputTokens / 1_000_000) *
        conversation.agent.model.inputTokenPrice.toNumber() +
      (reply.outputTokens / 1_000_000) *
        conversation.agent.model.outputTokenPrice.toNumber() +
      reply.fileSearchCalls * FILE_SEARCH_COST_PER_CALL +
      (reply.codeInterpreterCalls > 0
        ? CODE_INTERPRETER_MINIMUM_CHARGE_USD
        : 0);

    // include: { attachments: true } here too (always empty unless code_interpreter produced a
    // file this turn) so the shape matches fullUserMessage/findMessages exactly; the frontend's
    // Message type treats `attachments` as always-present.
    const assistantMessage = await this.prisma.agentMessage.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: reply.text,
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
        fileSearchCalls: reply.fileSearchCalls,
        codeInterpreterCalls: reply.codeInterpreterCalls,
        costUsd,
        attachments: { createMany: { data: generatedAttachments } },
      },
      include: { attachments: true },
    });
    await this.prisma.agentConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    const fullUserMessage = await this.prisma.agentMessage.findUniqueOrThrow({
      where: { id: userMessage.id },
      include: { attachments: true },
    });

    return { userMessage: fullUserMessage, assistantMessage };
  }

  // Admin read of another user's chat history (tenant/existence check is the caller's
  // responsibility — see assertAdminCanAccessUser, run before this in the controller). No
  // deleteMany-of-empty-threads here unlike findConversations: an admin browsing history
  // shouldn't have a side effect of deleting the very user's data they're inspecting.
  findConversationsForUserAsAdmin(
    userId: string,
    pagination: PaginationQueryDto,
  ) {
    return paginate(
      this.prisma.agentConversation,
      {
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          agent: { select: { name: true } },
          _count: { select: { messages: true } },
        },
      },
      pagination,
    );
  }

  // Ownership is enforced by the query itself (conversation.id AND conversation.userId must
  // both match) rather than a separate existence check — a conversationId that belongs to a
  // different user simply matches zero rows and returns an empty page, never an error. This is
  // deliberate: it's the same "ownership chain checked in the query" rule this codebase already
  // applies to attachment downloads, and it means a guessed/foreign conversationId can't be
  // used to probe for its existence via a differing error response.
  //
  // orderBy createdAt desc so page 1 is a conversation's most recent messages (paginate() is
  // plain offset paging) — the frontend is responsible for reversing each page to ascending
  // before rendering it.
  findMessagesForUserAsAdmin(
    userId: string,
    conversationId: string,
    pagination: PaginationQueryDto,
  ) {
    return paginate(
      this.prisma.agentMessage,
      {
        where: { conversation: { id: conversationId, userId } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
          attachments: true,
        },
      },
      pagination,
    );
  }

  // Admin read of every conversation held with a given Agent, across every user who has one —
  // the "who's using this Agent" view (tenant/existence check on the Agent itself is the
  // caller's responsibility, see assertAdminCanAccessAgent). For ADMIN, conversations are also
  // filtered by the conversation owner's tenantId: a platform-wide Agent (tenantId: null) is
  // visible to every ADMIN, but its cross-tenant users' chat history must not leak through just
  // because the Agent itself has no tenant restriction. SUPER_ADMIN sees every user's threads.
  findConversationsForAgentAsAdmin(
    agentId: string,
    actor: { role: Role; tenantId: string | null },
    pagination: PaginationQueryDto,
  ) {
    return paginate(
      this.prisma.agentConversation,
      {
        where: {
          agentId,
          user:
            actor.role === Role.ADMIN
              ? { tenantId: actor.tenantId }
              : undefined,
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          user: { select: { id: true, fullName: true, email: true } },
          _count: { select: { messages: true } },
        },
      },
      pagination,
    );
  }

  // Same ownership-chain-in-the-query approach as findMessagesForUserAsAdmin: a conversationId
  // that doesn't belong to this agentId (or, for ADMIN, whose owner isn't in-tenant) simply
  // matches zero rows rather than throwing.
  findMessagesForAgentAsAdmin(
    agentId: string,
    conversationId: string,
    actor: { role: Role; tenantId: string | null },
    pagination: PaginationQueryDto,
  ) {
    return paginate(
      this.prisma.agentMessage,
      {
        where: {
          conversation: {
            id: conversationId,
            agentId,
            user:
              actor.role === Role.ADMIN
                ? { tenantId: actor.tenantId }
                : undefined,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
          attachments: true,
        },
      },
      pagination,
    );
  }

  // Admin export source: every message ever sent in every conversation held with this Agent, in
  // one unpaginated fetch (the whole history becomes one CSV, not a browsing page) — same tenant
  // scoping as findConversationsForAgentAsAdmin. Ordered conversation-then-time so a
  // conversation's messages stay grouped and chronological within the file.
  findAllMessagesForAgentAsAdmin(
    agentId: string,
    actor: { role: Role; tenantId: string | null },
  ) {
    return this.prisma.agentMessage.findMany({
      where: {
        conversation: {
          agentId,
          user:
            actor.role === Role.ADMIN
              ? { tenantId: actor.tenantId }
              : undefined,
        },
      },
      orderBy: [{ conversationId: 'asc' }, { createdAt: 'asc' }],
      select: {
        role: true,
        content: true,
        createdAt: true,
        conversation: {
          select: {
            title: true,
            user: { select: { fullName: true, email: true } },
          },
        },
      },
    });
  }

  private loadConversation(conversationId: string, userId: string) {
    return this.prisma.agentConversation.findFirstOrThrow({
      where: { id: conversationId, userId },
      include: { agent: { include: { model: true, knowledgeBase: true } } },
    });
  }

  private decodeFileName(originalName: string) {
    // Multer/Busboy decodes multipart headers as latin1 regardless of the browser's actual
    // UTF-8 filename bytes — re-decoding here undoes that mojibake for non-ASCII filenames.
    return Buffer.from(originalName, 'latin1').toString('utf8');
  }

  // .csv/.xlsx/.xls all fail OpenAI's vector-store attach step with "not supported for
  // retrieval" even though the Files API accepts the upload — each is re-encoded as a same-named
  // .txt before it ever reaches OpenAI. Gated strictly by extension (never by declared MIME type,
  // which a client can lie about), so this conversion path only ever runs for genuinely
  // .csv/.xlsx/.xls uploads, exactly like every other extension-based branch in this file.
  private async uploadDocumentToOpenAi(
    file: Express.Multer.File,
  ): Promise<string> {
    const decodedName = this.decodeFileName(file.originalname);
    const ext = extname(decodedName).toLowerCase();
    if (!REENCODED_AS_TEXT_EXTENSIONS.has(ext)) {
      return this.openai.uploadFile(file.path, file.originalname);
    }
    const txtName = decodedName.replace(/\.[^.]+$/, '.txt');
    if (ext === '.csv') {
      // Already plain text — OpenAI is rejecting the extension, not the content, so the file's
      // bytes are uploaded unchanged under the renamed filename.
      return this.openai.uploadFile(file.path, txtName);
    }
    // .xlsx / .xls — a real binary format, so it has to be parsed and converted, not just
    // renamed. Each sheet becomes a CSV-style text block headed by its sheet name.
    const workbook = XLSX.readFile(file.path);
    const text = workbook.SheetNames.map(
      (name) => `# ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`,
    ).join('\n\n');
    return this.openai.uploadTextContent(text, txtName);
  }

  private async cleanupLocalFiles(files: Express.Multer.File[]) {
    for (const file of files) {
      try {
        await this.storage.delete(this.storage.save(file.path).key);
      } catch (err) {
        this.logger.warn(
          `Failed to delete orphaned local file ${file.path}`,
          err as Error,
        );
      }
    }
  }

  private async cleanupOpenAiFiles(fileIds: string[]) {
    for (const id of fileIds) {
      try {
        await this.openai.deleteFile(id);
      } catch (err) {
        this.logger.warn(`Failed to delete OpenAI file ${id}`, err as Error);
      }
    }
  }

  // Only called for a vector store this turn created (hadVectorStoreBefore was false) — never
  // deletes a pre-existing conversation vector store that other turns' documents still rely on.
  private async cleanupVectorStore(vectorStoreId: string | null) {
    if (!vectorStoreId) return;
    try {
      await this.openai.deleteVectorStore(vectorStoreId);
    } catch (err) {
      this.logger.warn(
        `Failed to delete orphaned OpenAI vector store ${vectorStoreId}`,
        err as Error,
      );
    }
  }

  // Same lazy-create + DB-conditional-write race guard as
  // KnowledgeBaseService.ensureVectorStore, scoped to one conversation instead of one KB.
  private async ensureConversationVectorStore(
    conversationId: string,
  ): Promise<string> {
    const newVectorStoreId = await this.openai.createVectorStore(
      `conversation-${conversationId}`,
    );
    const { count } = await this.prisma.agentConversation.updateMany({
      where: { id: conversationId, vectorStoreId: null },
      data: { vectorStoreId: newVectorStoreId },
    });
    if (count === 1) return newVectorStoreId;
    try {
      await this.openai.deleteVectorStore(newVectorStoreId);
    } catch (err) {
      this.logger.warn(
        `Failed to delete redundant OpenAI vector store ${newVectorStoreId}`,
        err as Error,
      );
    }
    const conversation = await this.prisma.agentConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    return conversation.vectorStoreId as string;
  }

  // Same lazy-create + DB-conditional-write race guard as ensureConversationVectorStore just
  // above, generalized to also cover *replacing* an existing (invalid) id, not only filling a
  // null one — every write to codeInterpreterContainerId, whether from a first-time container
  // creation or a rebuild-after-invalid, must go through this one path (spec: "数据流" step 7).
  private async writeCodeInterpreterContainerId(
    conversationId: string,
    previousValue: string | null,
    newContainerId: string,
  ): Promise<string> {
    const { count } = await this.prisma.agentConversation.updateMany({
      where: { id: conversationId, codeInterpreterContainerId: previousValue },
      data: { codeInterpreterContainerId: newContainerId },
    });
    if (count === 1) return newContainerId;
    // Lost the race — a concurrent request already wrote a different id. This turn's reply and
    // any AgentAttachment it produced already succeeded and are unaffected; only the id used for
    // the *next* turn changes. Delete this turn's own container to avoid an orphan — a failed
    // delete here is bounded/self-expiring (OpenAI's own idle timeout reclaims it), not worth
    // retrying.
    try {
      await this.openai.deleteContainer(newContainerId);
    } catch (err) {
      this.logger.warn(
        `Failed to delete redundant OpenAI container ${newContainerId}`,
        err as Error,
      );
    }
    const current = await this.prisma.agentConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { codeInterpreterContainerId: true },
    });
    return current.codeInterpreterContainerId!;
  }

  // Every document this conversation has ever uploaded (images are excluded — they never get an
  // openaiFileId, per the AgentAttachment model comment). Re-mounted in full on every container
  // create/rebuild — a known, documented trade-off in the spec's "已知取舍", not an oversight.
  private async getConversationDocumentFileIds(
    conversationId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.agentAttachment.findMany({
      where: {
        message: { conversationId },
        type: 'DOCUMENT',
        openaiFileId: { not: null },
      },
      select: { openaiFileId: true },
    });
    return rows.map((r) => r.openaiFileId!);
  }

  // Downloads every file code_interpreter produced this turn (source !== 'user' filters out the
  // ones we mounted as input). Anything in CODE_INTERPRETER_DISALLOWED_EXTENSIONS (.pdf) is
  // skipped entirely — never downloaded, never attached — regardless of what the model tried to
  // produce; the system prompt tells it not to, but this is the hard backstop.
  private async downloadCodeInterpreterOutputFiles(
    containerId: string,
  ): Promise<AttachmentInput[]> {
    const attachments: AttachmentInput[] = [];
    const containerFiles = await this.openai.listContainerFiles(containerId);
    const produced = containerFiles.filter((f) => f.source !== 'user');
    for (const file of produced) {
      const fileName = file.path.split('/').pop() ?? file.id;
      const ext = extname(fileName);
      if (CODE_INTERPRETER_DISALLOWED_EXTENSIONS.has(ext)) {
        this.logger.warn(
          `code_interpreter produced a disallowed file type (${ext}) in container ${containerId} — dropped, not downloaded`,
        );
        continue;
      }
      const buffer = await this.openai.downloadContainerFile(
        containerId,
        file.id,
      );
      const diskPath = join(
        this.storage.root,
        'agent-attachments',
        `${randomUUID()}${ext}`,
      );
      await mkdir(dirname(diskPath), { recursive: true });
      await writeFile(diskPath, buffer);
      const { key } = this.storage.save(diskPath);
      attachments.push({
        type: 'DOCUMENT',
        fileName,
        fileUrl: key,
        mimeType:
          CODE_INTERPRETER_OUTPUT_MIME_TYPES[ext] ?? 'application/octet-stream',
        sizeBytes: buffer.byteLength,
        openaiFileId: null,
      });
    }
    return attachments;
  }
}
