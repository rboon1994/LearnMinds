import { BadRequestException, Injectable } from '@nestjs/common';
import { VideoType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { Actor } from './courses.service';
import { CoursesService } from './courses.service';
import type { CreateLessonDto } from './dto/create-lesson.dto';

// Vimeo's plain watch-page link (vimeo.com/<id>) can't be embedded in an <iframe> — only the
// player link (player.vimeo.com/video/<id>) can. Rewrite watch-page links so editors can paste
// whatever Vimeo gives them to share. A private-link hash segment (vimeo.com/<id>/<hash>) is
// carried over as the player's `h` query param. Any other URL (already a player link, YouTube,
// etc.) passes through unchanged.
function normalizeVimeoUrl(url: string): string {
  const match = url.match(/vimeo\.com\/(\d+)(?:\/([a-zA-Z0-9]+))?/);
  if (!match) return url;
  const [, id, hash] = match;
  return hash
    ? `https://player.vimeo.com/video/${id}?h=${hash}`
    : `https://player.vimeo.com/video/${id}`;
}

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
      data: {
        ...dto,
        videoUrl:
          dto.videoType === VideoType.EXTERNAL_LINK && dto.videoUrl
            ? normalizeVimeoUrl(dto.videoUrl)
            : dto.videoUrl,
        courseId,
        order: (last._max.order ?? -1) + 1,
      },
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
      data: {
        videoType,
        videoUrl:
          videoType === VideoType.EXTERNAL_LINK
            ? normalizeVimeoUrl(videoUrl)
            : videoUrl,
      },
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
