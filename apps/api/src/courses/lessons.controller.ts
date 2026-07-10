import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role, VideoType } from '@prisma/client';
import { createReadStream, statSync } from 'fs';
import type { Request as ExpressRequest, Response } from 'express';
import { RequireFeature } from '../auth/decorators/require-feature.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StorageService } from '../storage/storage.service';
import { multerDiskStorage } from '../storage/storage.multer';
import type { AuthReq } from './courses.controller';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { ReorderLessonsDto } from './dto/reorder-lessons.dto';
import { LessonsService } from './lessons.service';

// AdminFeatureGuard forbids Role.USER outright, so — like CoursesController — it's applied
// per mutating-method only; the video-stream GET route must stay reachable by Role.USER.
@Controller('courses/:courseId/lessons')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class LessonsController {
  constructor(
    private svc: LessonsService,
    private storage: StorageService,
  ) {}

  @Post()
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateLessonDto,
    @Request() req: AuthReq,
  ) {
    return this.svc.create(courseId, dto, req.user);
  }

  @Patch('reorder')
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  reorder(
    @Param('courseId') courseId: string,
    @Body() dto: ReorderLessonsDto,
    @Request() req: AuthReq,
  ) {
    return this.svc.reorder(courseId, dto.ids, req.user);
  }

  @Patch(':id')
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  update(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateLessonDto>,
    @Request() req: AuthReq,
  ) {
    return this.svc.update(courseId, id, dto, req.user);
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

  @Post(':id/video')
  @UseGuards(AdminFeatureGuard)
  @RequireFeature('course-management')
  @UseInterceptors(
    FileInterceptor('file', { storage: multerDiskStorage('videos') }),
  )
  async uploadVideo(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Body('videoType') videoType: VideoType,
    @Body('videoUrl') videoUrl: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: AuthReq,
  ) {
    if (videoType === VideoType.UPLOAD) {
      if (!file)
        throw new BadRequestException('file is required for videoType UPLOAD');
      const { key } = this.storage.save(file.path);
      return this.svc.setVideo(courseId, id, videoType, key, req.user);
    }
    if (videoType === VideoType.EXTERNAL_LINK) {
      if (!videoUrl)
        throw new BadRequestException(
          'videoUrl is required for videoType EXTERNAL_LINK',
        );
      return this.svc.setVideo(courseId, id, videoType, videoUrl, req.user);
    }
    throw new BadRequestException('Invalid videoType');
  }

  // Authenticated, visibility-checked video stream — never served as a bare static file,
  // since draft/tenant-scoped videos must not be reachable by a guessable public URL.
  // Reachable by any authenticated role (Role.USER included) that can see the course.
  @Get(':id/video')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER, Role.STUDENT)
  async streamVideo(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Request() req: AuthReq & ExpressRequest,
    @Res() res: Response,
  ) {
    const { path } = await this.svc.getStreamableVideo(courseId, id, req.user);
    const { size } = statSync(path);
    const range = req.headers['range'];

    // Without an explicit Content-Type, the blob the browser receives has none — desktop
    // browsers often play it anyway by sniffing, but mobile Safari rejects it outright with
    // MEDIA_ERR_SRC_NOT_SUPPORTED. res.type() derives it from the file's stored extension.
    res.type(path);

    if (!range) {
      res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes' });
      createReadStream(path).pipe(res);
      return;
    }

    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
    });
    createReadStream(path, { start, end }).pipe(res);
  }
}
