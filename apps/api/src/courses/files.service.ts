import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { Actor } from './courses.service';
import { CoursesService } from './courses.service';

export type UploadedFileMeta = {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
};

@Injectable()
export class CourseFilesService {
  constructor(
    private prisma: PrismaService,
    private courses: CoursesService,
    private storage: StorageService,
  ) {}

  async create(courseId: string, file: UploadedFileMeta, actor: Actor) {
    await this.courses.assertManageable(courseId, actor);
    return this.prisma.courseFile.create({ data: { ...file, courseId } });
  }

  async delete(courseId: string, fileId: string, actor: Actor) {
    await this.courses.assertManageable(courseId, actor);
    const file = await this.prisma.courseFile.findFirstOrThrow({
      where: { id: fileId, courseId },
    });
    await this.storage.delete(file.fileUrl);
    await this.prisma.courseFile.delete({ where: { id: fileId } });
  }

  async getDownloadable(courseId: string, fileId: string, actor: Actor) {
    await this.courses.assertVisible(courseId, actor);
    const file = await this.prisma.courseFile.findFirstOrThrow({
      where: { id: fileId, courseId },
    });
    return {
      path: this.storage.resolvePath(file.fileUrl),
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }
}
