import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { extname } from 'path';
import type { Response } from 'express';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StorageService } from '../storage/storage.service';
import { multerDiskStorage } from '../storage/storage.multer';
import type { AuthReq } from './courses.controller';
import { CourseFilesService } from './files.service';

// Mirrors the frontend's FileUpload `accept`/`maxSizeBytes` on the course Files uploader — kept
// in sync by hand since Multer's fileFilter has no way to share a client-side prop list.
const ALLOWED_FILE_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.csv',
  '.txt',
  '.md',
];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

// Same guard-stacking rationale as LessonsController: AdminFeatureGuard applied per-method
// only, so the download route stays reachable by Role.USER.
@Controller('courses/:courseId/files')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class FilesController {
  constructor(
    private svc: CourseFilesService,
    private storage: StorageService,
  ) {}

  @Post()
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multerDiskStorage('files'),
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
  async upload(
    @Param('courseId') courseId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: AuthReq,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const { key } = this.storage.save(file.path);
    return this.svc.create(
      courseId,
      {
        // Multer/Busboy decodes multipart headers as latin1 regardless of the browser's actual
        // UTF-8 filename bytes — re-decoding here undoes that mojibake for non-ASCII filenames.
        fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        fileUrl: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
      req.user,
    );
  }

  @Delete(':id')
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  delete(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Request() req: AuthReq,
  ) {
    return this.svc.delete(courseId, id, req.user);
  }

  // Authenticated download — same rationale as the lesson video stream route: never a bare
  // static file, always re-checks course visibility (draft/tenant scoping) first.
  @Get(':id/download')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER, Role.STUDENT)
  async download(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Request() req: AuthReq,
    @Res() res: Response,
  ) {
    const { path, fileName, mimeType } = await this.svc.getDownloadable(
      courseId,
      id,
      req.user,
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.sendFile(path);
  }
}
