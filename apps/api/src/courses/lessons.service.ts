import { BadRequestException, Injectable } from '@nestjs/common';
import { VideoType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { Actor } from './courses.service';
import { CoursesService } from './courses.service';
import type { CreateLessonDto } from './dto/create-lesson.dto';

@Injectable()
export class LessonsService {
  constructor(
    private prisma: PrismaService,
    private courses: CoursesService,
    private storage: StorageService,
  ) {}

  async create(courseId: string, dto: CreateLessonDto, actor: Actor) {
    await this.courses.assertManageable(courseId, actor);
    const last = await this.prisma.lesson.aggregate({
      where: { courseId },
      _max: { order: true },
    });
    return this.prisma.lesson.create({
      data: { ...dto, courseId, order: (last._max.order ?? -1) + 1 },
    });
  }

  async update(
    courseId: string,
    lessonId: string,
    dto: Partial<CreateLessonDto>,
    actor: Actor,
  ) {
    await this.courses.assertManageable(courseId, actor);
    await this.prisma.lesson.findFirstOrThrow({
      where: { id: lessonId, courseId },
    });
    return this.prisma.lesson.update({ where: { id: lessonId }, data: dto });
  }

  async delete(courseId: string, lessonId: string, actor: Actor) {
    await this.courses.assertManageable(courseId, actor);
    const lesson = await this.prisma.lesson.findFirstOrThrow({
      where: { id: lessonId, courseId },
    });
    if (lesson.videoType === VideoType.UPLOAD && lesson.videoUrl) {
      await this.storage.delete(lesson.videoUrl);
    }
    await this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  async reorder(courseId: string, ids: string[], actor: Actor) {
    await this.courses.assertManageable(courseId, actor);
    const count = await this.prisma.lesson.count({
      where: { id: { in: ids }, courseId },
    });
    if (count !== ids.length) {
      throw new BadRequestException(
        'One or more lesson ids do not belong to this course',
      );
    }
    return this.prisma.$transaction(
      ids.map((id, order) =>
        this.prisma.lesson.update({ where: { id }, data: { order } }),
      ),
    );
  }

  async setVideo(
    courseId: string,
    lessonId: string,
    videoType: VideoType,
    videoUrl: string,
    actor: Actor,
  ) {
    await this.courses.assertManageable(courseId, actor);
    const lesson = await this.prisma.lesson.findFirstOrThrow({
      where: { id: lessonId, courseId },
    });
    if (
      lesson.videoType === VideoType.UPLOAD &&
      lesson.videoUrl &&
      lesson.videoUrl !== videoUrl
    ) {
      await this.storage.delete(lesson.videoUrl);
    }
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: { videoType, videoUrl },
    });
  }

  async getStreamableVideo(courseId: string, lessonId: string, actor: Actor) {
    await this.courses.assertVisible(courseId, actor);
    const lesson = await this.prisma.lesson.findFirstOrThrow({
      where: { id: lessonId, courseId },
    });
    if (lesson.videoType !== VideoType.UPLOAD || !lesson.videoUrl) {
      throw new BadRequestException(
        'This lesson has no uploaded video to stream',
      );
    }
    return { path: this.storage.resolvePath(lesson.videoUrl) };
  }
}
