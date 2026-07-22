import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OpenAiService } from '../openai/openai.service';
import type { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import type { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

export type UploadedFileMeta = {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
};

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private openai: OpenAiService,
  ) {}

  findAll() {
    return this.prisma.knowledgeBase.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: CreateKnowledgeBaseDto) {
    return this.prisma.knowledgeBase.create({ data: dto });
  }

  async update(id: string, dto: UpdateKnowledgeBaseDto) {
    await this.prisma.knowledgeBase.findUniqueOrThrow({ where: { id } });
    return this.prisma.knowledgeBase.update({ where: { id }, data: dto });
  }

  // Cloud cleanup happens before the local delete — Prisma's onDelete: Cascade/SetNull only
  // reaches local rows, never OpenAI, so every synced file and the vector store would otherwise
  // become an orphaned, billable cloud resource.
  async remove(id: string) {
    const kb = await this.prisma.knowledgeBase.findUniqueOrThrow({
      where: { id },
      include: { files: true },
    });
    for (const file of kb.files) {
      if (!file.openaiFileId) continue;
      try {
        await this.openai.deleteFile(file.openaiFileId);
      } catch (err) {
        // A stale/already-gone OpenAI file must not block the local delete — but a genuine
        // failure (revoked key, outage) must still leave a trail instead of looking identical
        // to a harmless no-op.
        this.logger.warn(
          `Failed to delete OpenAI file ${file.openaiFileId}`,
          err as Error,
        );
      }
    }
    if (kb.vectorStoreId) {
      try {
        await this.openai.deleteVectorStore(kb.vectorStoreId);
      } catch (err) {
        this.logger.warn(
          `Failed to delete OpenAI vector store ${kb.vectorStoreId}`,
          err as Error,
        );
      }
    }
    await this.prisma.knowledgeBase.delete({ where: { id } });
  }

  async findAllFiles(knowledgeBaseId: string) {
    await this.prisma.knowledgeBase.findUniqueOrThrow({
      where: { id: knowledgeBaseId },
    });
    return this.prisma.knowledgeBaseFile.findMany({
      where: { knowledgeBaseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // The KB lookup and Vector Store resolution run in their own try/catch, scoped to exactly the
  // window where no KnowledgeBaseFile row exists yet — multer already wrote the file to disk
  // before this method ran, so a failure here must clean it up or it's an invisible orphan.
  // syncFile() runs outside this try/catch entirely (not nested inside it), so there's no
  // ambiguity about whether its own failures could trigger this cleanup after the row exists.
  async createFile(knowledgeBaseId: string, file: UploadedFileMeta) {
    let vectorStoreId: string;
    try {
      const kb = await this.prisma.knowledgeBase.findUniqueOrThrow({
        where: { id: knowledgeBaseId },
      });
      vectorStoreId =
        kb.vectorStoreId ??
        (await this.ensureVectorStore(knowledgeBaseId, kb.name));
    } catch (err) {
      try {
        await this.storage.delete(file.fileUrl);
      } catch (cleanupErr) {
        // Don't let a cleanup failure hide the real cause of the original error.
        this.logger.warn(
          `Failed to delete orphaned local file ${file.fileUrl}`,
          cleanupErr as Error,
        );
      }
      throw err;
    }
    const record = await this.prisma.knowledgeBaseFile.create({
      data: { ...file, knowledgeBaseId, status: 'PENDING' },
    });
    return this.syncFile(record.id, vectorStoreId, file);
  }

  private async syncFile(
    recordId: string,
    vectorStoreId: string,
    file: UploadedFileMeta,
  ) {
    let openaiFileId: string | undefined;
    try {
      openaiFileId = await this.openai.uploadFile(
        this.storage.resolvePath(file.fileUrl),
        file.fileName,
      );
      await this.openai.attachFileToVectorStore(vectorStoreId, openaiFileId);
      return this.prisma.knowledgeBaseFile.update({
        where: { id: recordId },
        data: { status: 'SYNCED', openaiFileId },
      });
    } catch {
      // openaiFileId may already exist in OpenAI even though the attach step failed — persist
      // it so deleteFile()/remove() can still clean it up later instead of leaking it forever.
      return this.prisma.knowledgeBaseFile.update({
        where: { id: recordId },
        data: { status: 'FAILED', openaiFileId },
      });
    }
  }

  async deleteFile(knowledgeBaseId: string, fileId: string) {
    const file = await this.prisma.knowledgeBaseFile.findFirstOrThrow({
      where: { id: fileId, knowledgeBaseId },
    });
    if (file.openaiFileId) {
      try {
        await this.openai.deleteFile(file.openaiFileId);
      } catch (err) {
        this.logger.warn(
          `Failed to delete OpenAI file ${file.openaiFileId}`,
          err as Error,
        );
      }
    }
    await this.storage.delete(file.fileUrl);
    await this.prisma.knowledgeBaseFile.delete({ where: { id: fileId } });
  }

  // Guards against the race where several files are uploaded back-to-back (or two admins upload
  // concurrently) before the first upload's Vector Store creation has persisted. The DB
  // updateMany below is the sole correctness mechanism — a conditional write, so only the request
  // whose update actually changes a row wins and gets to keep its Vector Store; every other racer
  // deletes its own redundant one. This tolerates concurrent callers correctly on its own; it just
  // doesn't avoid the extra create+delete OpenAI round-trip a rare race costs, which isn't worth
  // an in-process lock to prevent on this low-traffic, admin-only path.
  private async ensureVectorStore(
    knowledgeBaseId: string,
    name: string,
  ): Promise<string> {
    const newVectorStoreId = await this.openai.createVectorStore(name);
    const { count } = await this.prisma.knowledgeBase.updateMany({
      where: { id: knowledgeBaseId, vectorStoreId: null },
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
    const kb = await this.prisma.knowledgeBase.findUniqueOrThrow({
      where: { id: knowledgeBaseId },
    });
    return kb.vectorStoreId as string;
  }
}
