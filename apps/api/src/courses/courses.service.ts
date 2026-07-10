import { Injectable } from '@nestjs/common';
import { ContentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCourseDto } from './dto/create-course.dto';

export type Actor = {
  userId: string;
  tenantId: string | null;
  studentId: string | null;
  role: Role;
};

// <input type="date"> sends a bare "YYYY-MM-DD", but Prisma's DateTime column requires a full
// ISO-8601 datetime — passing the bare date straight through throws "premature end of input".
function toDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  // Admin: own tenant only, draft + published (decision 3 — any admin in the tenant sees everything).
  findAllForAdmin(tenantId: string) {
    return this.prisma.course.findMany({
      where: { tenantId },
      include: { _count: { select: { lessons: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Super Admin: every tenant's courses plus global ones.
  findAllForSuperAdmin() {
    return this.prisma.course.findMany({
      include: {
        _count: { select: { lessons: true } },
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Role-aware browse list for /learn: Super Admin sees every course including drafts (the
  // "全部 Courses...可浏览草稿和已发布的" requirement — this previously always filtered to
  // PUBLISHED regardless of role, hiding drafts from Super Admin here too); Admin sees their
  // own tenant's courses at any status plus published global ones; everyone else (USER) only
  // sees published tenant-or-global courses. Mirrors visibilityWhere used for single-course reads.
  findBrowsable(actor: Actor) {
    return this.prisma.course.findMany({
      where: this.visibilityWhere(actor),
      include: { _count: { select: { lessons: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actor: Actor) {
    const course = await this.prisma.course.findFirstOrThrow({
      where: { id, ...this.visibilityWhere(actor) },
      include: { lessons: { orderBy: { order: 'asc' } }, files: true },
    });
    return course;
  }

  // Used by lessons/files streaming routes to confirm the actor may view this course
  // (draft-visibility for Admin/Super Admin, published-only for everyone else) before
  // serving a video/file that lives under it.
  async assertVisible(id: string, actor: Actor) {
    return this.prisma.course.findFirstOrThrow({
      where: { id, ...this.visibilityWhere(actor) },
    });
  }

  async create(dto: CreateCourseDto, actor: Actor) {
    return this.prisma.course.create({
      data: {
        ...dto,
        startDate: toDate(dto.startDate),
        endDate: toDate(dto.endDate),
        tenantId: actor.role === Role.SUPER_ADMIN ? null : actor.tenantId,
        createdById: actor.userId,
      },
    });
  }

  async update(id: string, dto: Partial<CreateCourseDto>, actor: Actor) {
    await this.assertManageable(id, actor);
    return this.prisma.course.update({
      where: { id },
      data: {
        ...dto,
        startDate: toDate(dto.startDate),
        endDate: toDate(dto.endDate),
      },
    });
  }

  async delete(id: string, actor: Actor) {
    await this.assertManageable(id, actor);
    await this.prisma.course.delete({ where: { id } });
  }

  // Admins may only manage their own tenant's courses; Super Admin manages any course.
  async assertManageable(id: string, actor: Actor) {
    const where =
      actor.role === Role.SUPER_ADMIN
        ? { id }
        : { id, tenantId: actor.tenantId };
    return this.prisma.course.findFirstOrThrow({ where });
  }

  // Read-visibility rules, shared by findOne/assertVisible/findBrowsable: Admin sees their
  // tenant's courses (draft+published), Super Admin sees everything (including every tenant's
  // drafts — no filter at all), Student sees only currently-enrolled+published (never Draft, never
  // "all global courses" — must be explicitly assigned by Super Admin via a CourseSeries
  // enrollment; a course with no series can never be Student-visible), everyone else (USER) only
  // sees published tenant-or-global courses.
  private visibilityWhere(actor: Actor) {
    if (actor.role === Role.SUPER_ADMIN) return {};
    if (actor.role === Role.ADMIN) return { tenantId: actor.tenantId };
    if (actor.role === Role.STUDENT) {
      const now = new Date();
      return {
        status: ContentStatus.PUBLISHED,
        series: {
          enrollments: {
            some: {
              studentId: actor.studentId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          },
        },
      };
    }
    return {
      status: ContentStatus.PUBLISHED,
      OR: [{ tenantId: actor.tenantId }, { tenantId: null }],
    };
  }
}
