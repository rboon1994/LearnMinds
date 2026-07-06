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
import type { Response } from 'express';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StorageService } from '../storage/storage.service';
import { multerDiskStorage } from '../storage/storage.multer';
import type { AuthReq } from './courses.controller';
import { CourseFilesService } from './files.service';

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
    FileInterceptor('file', { storage: multerDiskStorage('files') }),
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
        fileName: file.originalname,
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER)
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
