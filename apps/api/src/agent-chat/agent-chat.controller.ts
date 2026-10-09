import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { extname } from 'path';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { buildAgentChatExportCsv } from './agent-chat-export';
import {
  assertAdminCanAccessAgent,
  assertAdminCanAccessUser,
} from '../common/assert-admin-target';
import { buildContentDispositionHeader } from '../common/content-disposition';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { multerDiskStorage } from '../storage/storage.multer';
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_IMAGE_EXTENSIONS,
  AgentChatService,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_DOCUMENTS_PER_MESSAGE,
  MAX_IMAGES_PER_MESSAGE,
} from './agent-chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

type AuthReq = {
  user: { userId: string; tenantId: string | null; role: Role };
};
type MessageFiles = {
  documents?: Express.Multer.File[];
  images?: Express.Multer.File[];
};

// Any authenticated user can chat — mirrors CoursesController's student-reachable routes.
@Controller('agent-chat')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER, Role.STUDENT)
export class AgentChatController {
  constructor(
    private svc: AgentChatService,
    private prisma: PrismaService,
  ) {}

  @Get('agents')
  findAgents(@Request() req: AuthReq) {
    return this.svc.findPublishedAgents(
      req.user.userId,
      req.user.role,
      req.user.tenantId,
    );
  }

  @Get('conversations')
  findConversations(
    @Request() req: AuthReq,
    @Query('activeConversationId') activeConversationId?: string,
  ) {
    return this.svc.findConversations(
      req.user.userId,
      req.user.role,
      req.user.tenantId,
      activeConversationId,
    );
  }

  @Post('conversations')
  createConversation(
    @Request() req: AuthReq,
    @Body() dto: CreateConversationDto,
  ) {
    return this.svc.createConversation(
      req.user.userId,
      dto.agentId,
      req.user.role,
      req.user.tenantId,
    );
  }

  @Patch('conversations/:id')
  renameConversation(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.svc.renameConversation(req.user.userId, id, dto.title);
  }

  @Get('conversations/:id/messages')
  findMessages(@Request() req: AuthReq, @Param('id') id: string) {
    return this.svc.findMessages(req.user.userId, id);
  }

  @Post('conversations/:id/messages')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'documents', maxCount: MAX_DOCUMENTS_PER_MESSAGE },
        { name: 'images', maxCount: MAX_IMAGES_PER_MESSAGE },
      ],
      {
        storage: multerDiskStorage('agent-attachments'),
        // The tighter 10MB image cap is re-checked in the service — multer's fileSize limit is
        // one number shared across every field on this interceptor, so it's set to the larger
        // (document) ceiling here.
        limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
        fileFilter: (_req, file, callback) => {
          const ext = extname(file.originalname).toLowerCase();
          const allowed =
            file.fieldname === 'images'
              ? ALLOWED_IMAGE_EXTENSIONS
              : ALLOWED_DOCUMENT_EXTENSIONS;
          if (!allowed.includes(ext)) {
            callback(
              new BadRequestException(`Unsupported file type: ${ext}`),
              false,
            );
            return;
          }
          callback(null, true);
        },
      },
    ),
  )
  // Streamed as newline-delimited JSON, not JSON-over-HTTP — each line is one
  // `{type: 'status'|'delta'|'done'|'error', ...}` event, so the frontend can render the reply
  // bubble-by-bubble as OpenAI generates it instead of waiting for the full completion, and show
  // "Uploading…" / "Thinking…" / "Generating file…" as appropriate.
  // Pre-stream failures (validation, ownership, attachment upload) still throw normally and are
  // reported as a `type: 'error'` line rather than an HTTP error status, since the response
  // headers (200) are already committed the moment the first byte is written.
  async sendMessage(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @UploadedFiles() files: MessageFiles,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    try {
      const result = await this.svc.sendMessage(
        req.user.userId,
        id,
        dto.content,
        req.user.role,
        req.user.tenantId,
        files?.documents ?? [],
        files?.images ?? [],
        (text: string) =>
          res.write(`${JSON.stringify({ type: 'delta', text })}\n`),
        (phase: 'thinking' | 'generating_file') =>
          res.write(`${JSON.stringify({ type: 'status', phase })}\n`),
      );
      res.write(`${JSON.stringify({ type: 'done', ...result })}\n`);
    } catch (err) {
      const status = err instanceof HttpException ? err.getStatus() : 500;
      const body = err instanceof HttpException ? err.getResponse() : null;
      const message =
        body && typeof body === 'object' && 'message' in body
          ? body.message
          : 'Failed to send message';
      // A no-op if a delta/status event already wrote the response headers (streaming had
      // already started) — harmless, since res.write below is the only way to surface the
      // failure once that's happened. Sets the real status for the common case where this is
      // the very first byte written (validation/ownership/attachment failures).
      res.status(status);
      res.write(`${JSON.stringify({ type: 'error', status, message })}\n`);
    } finally {
      res.end();
    }
  }

  // Admin view of another user's chat history. Tenant/existence is re-checked on every call
  // (not cached from a prior request) — assertAdminCanAccessUser 404s for a nonexistent user,
  // a cross-tenant User, or any Student, uniformly, for both routes below.
  @Get('admin/users/:userId/conversations')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async findConversationsForUser(
    @Request() req: AuthReq,
    @Param('userId') userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    await assertAdminCanAccessUser(this.prisma, req.user, userId);
    return this.svc.findConversationsForUserAsAdmin(userId, query);
  }

  @Get('admin/users/:userId/conversations/:conversationId/messages')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async findMessagesForUser(
    @Request() req: AuthReq,
    @Param('userId') userId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    await assertAdminCanAccessUser(this.prisma, req.user, userId);
    return this.svc.findMessagesForUserAsAdmin(userId, conversationId, query);
  }

  // Admin view of "who's using this Agent" — every conversation held with a given Agent, across
  // every user, rather than starting from a single known user. Tenant scoping is handled in two
  // layers: assertAdminCanAccessAgent gates the Agent itself, then the service additionally
  // scopes conversations by the owning user's tenantId for ADMIN (never for SUPER_ADMIN) — see
  // findConversationsForAgentAsAdmin's comment for why that second layer is needed.
  @Get('admin/agents/:agentId/conversations')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async findConversationsForAgent(
    @Request() req: AuthReq,
    @Param('agentId') agentId: string,
    @Query() query: PaginationQueryDto,
  ) {
    await assertAdminCanAccessAgent(this.prisma, req.user, agentId);
    return this.svc.findConversationsForAgentAsAdmin(
      agentId,
      req.user,
      query,
    );
  }

  // Whole-history export as CSV — unpaginated, so it must stay registered before the
  // :conversationId param route below (a literal segment can otherwise lose to an adjacent param
  // route depending on registration order).
  @Get('admin/agents/:agentId/conversations/export')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async exportConversationsForAgent(
    @Request() req: AuthReq,
    @Param('agentId') agentId: string,
    @Res() res: Response,
  ) {
    await assertAdminCanAccessAgent(this.prisma, req.user, agentId);
    const agent = await this.prisma.aiAgent.findUniqueOrThrow({
      where: { id: agentId },
      select: { name: true },
    });
    const rows = await this.svc.findAllMessagesForAgentAsAdmin(
      agentId,
      req.user,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      buildContentDispositionHeader(
        'attachment',
        `${agent.name}-chat-export.csv`,
      ),
    );
    res.send(buildAgentChatExportCsv(rows));
  }

  @Get('admin/agents/:agentId/conversations/:conversationId/messages')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async findMessagesForAgent(
    @Request() req: AuthReq,
    @Param('agentId') agentId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    await assertAdminCanAccessAgent(this.prisma, req.user, agentId);
    return this.svc.findMessagesForAgentAsAdmin(
      agentId,
      conversationId,
      req.user,
      query,
    );
  }

  // Authenticated download, ownership-checked in the service — never a bare static file
  // (mirrors CourseFilesController's :id/download rationale). `inline` (not `attachment`) so
  // images/PDFs open in the browser for "click to view" instead of forcing a download.
  @Get('attachments/:id/download')
  async downloadAttachment(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { path, fileName, mimeType } = await this.svc.getAttachmentDownload(
      req.user,
      id,
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      buildContentDispositionHeader('attachment', fileName),
    );
    res.sendFile(path);
  }
}
