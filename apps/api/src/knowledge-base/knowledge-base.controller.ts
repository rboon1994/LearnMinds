import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { extname } from 'path';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StorageService } from '../storage/storage.service';
import { multerDiskStorage } from '../storage/storage.multer';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';
import { KnowledgeBaseService } from './knowledge-base.service';

// OpenAI file_search-supported extensions.
const ALLOWED_FILE_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.html',
];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

// Super-Admin-only, global — same tier as AiAgents/AiAgentModels, no AdminFeatureGuard.
@Controller('knowledge-bases')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class KnowledgeBaseController {
  constructor(
    private svc: KnowledgeBaseService,
    private storage: StorageService,
  ) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  create(@Body() dto: CreateKnowledgeBaseDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgeBaseDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Get(':id/files')
  findAllFiles(@Param('id') id: string) {
    return this.svc.findAllFiles(id);
  }

  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multerDiskStorage('knowledge-base'),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (
          !ALLOWED_FILE_EXTENSIONS.includes(
            extname(file.originalname).toLowerCase(),
          )
        ) {
          callback(new BadRequestException('File type not supported'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const { key } = this.storage.save(file.path);
    return this.svc.createFile(id, {
      // Multer/Busboy decodes multipart headers as latin1 regardless of the browser's actual
      // UTF-8 filename bytes — re-decoding here undoes that mojibake for non-ASCII filenames.
      fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      fileUrl: key,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
  }

  @Delete(':id/files/:fileId')
  deleteFile(@Param('id') id: string, @Param('fileId') fileId: string) {
    return this.svc.deleteFile(id, fileId);
  }
}
