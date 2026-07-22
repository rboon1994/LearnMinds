import { Injectable } from '@nestjs/common';
import { ContentStatus, Prisma, Role } from '@prisma/client';
import { paginate } from '../common/paginate';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCourseDto } from './dto/create-course.dto';
import type { CoursesQueryDto } from './dto/courses-query.dto';

export type Actor = {
  userId: string;
  tenantId: string | null;
  studentId: string | null;
  role: Role;
};

type CourseAdminRow = Prisma.CourseGetPayload<{
  include: {
    _count: { select: { lessons: true; files: true } };
    series: { select: { id: true; name: true } };
  };
}>;

type CourseSuperAdminRow = Prisma.CourseGetPayload<{
  include: {
    _count: { select: { lessons: true; files: true } };
    tenant: { select: { id: true; name: true } };
    series: { select: { id: true; name: true } };
  };
}>;

function searchFilterWhere(query: CoursesQueryDto): Prisma.CourseWhereInput {
  return {
    ...(query.search
      ? { title: { contains: query.search, mode: 'insensitive' } }
      : {}),
    ...(query.seriesId ? { seriesId: query.seriesId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
}

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
  findAllForAdmin(tenantId: string, query: CoursesQueryDto) {
    return paginate<CourseAdminRow, Prisma.CourseWhereInput>(
      this.prisma.course,
      {
        where: { tenantId, ...searchFilterWhere(query) },
        include: {
          _count: { select: { lessons: true, files: true } },
          series: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  // Super Admin: every tenant's courses plus global ones.
  findAllForSuperAdmin(query: CoursesQueryDto) {
    return paginate<CourseSuperAdminRow, Prisma.CourseWhereInput>(
      this.prisma.course,
      {
        where: searchFilterWhere(query),
        include: {
          _count: { select: { lessons: true, files: true } },
          tenant: { select: { id: true, name: true } },
          series: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  // Flat, minimal-field picker source for the admin Enrollments "Individual Course" dropdown —
  // paginated + searchable like everything else the picker pattern reuses (students, enrollments),
  // not a bespoke unpaginated list, since the course catalog can grow the same way those can.
  findAllFlat(query: CoursesQueryDto) {
    return paginate<
      Prisma.CourseGetPayload<{
        select: { id: true; title: true; startDate: true; endDate: true };
      }>,
      Prisma.CourseWhereInput
    >(
      this.prisma.course,
      {
        where: searchFilterWhere(query),
        select: { id: true, title: true, startDate: true, endDate: true },
        orderBy: { title: 'asc' },
      },
      { page: query.page, pageSize: query.pageSize },
    );
  }

  // Learn-page browse: returns global courses (tenantId: null) with isEnrolled flag.
  // SUPER_ADMIN sees all statuses (including DRAFT) with no enrollment lock.
  // Everyone else sees only PUBLISHED; isEnrolled is computed from active Enrollment records.
  async findBrowsable(actor: Actor) {
    // Bug fix 1: SUPER_ADMIN must not have the status filter — they need to see DRAFT too.
    if (actor.role === Role.SUPER_ADMIN) {
      const courses = await this.prisma.course.findMany({
        where: { tenantId: null },
        include: {
          _count: { select: { lessons: true } },
          speakers: { select: { id: true, name: true, thumbnail: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return courses.map((c) => ({ ...c, isEnrolled: true }));
    }

    const courses = await this.prisma.course.findMany({
      where: { tenantId: null, status: ContentStatus.PUBLISHED },
      include: {
        _count: { select: { lessons: true } },
        speakers: { select: { id: true, name: true, thumbnail: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Bug fix 2: studentId is not in the JWT so actor.studentId is undefined.
    // Prisma silently ignores undefined in where clauses, turning { studentId: undefined }
    // into an unconstrained query that returns all enrollments. Guard with a truthiness check.
    const relevantId =
      actor.role === Role.STUDENT ? actor.studentId : actor.tenantId;

    if (!relevantId) {
      return courses.map((c) => ({ ...c, isEnrolled: false }));
    }

    const now = new Date();
    const enrollmentWhere =
      actor.role === Role.STUDENT
        ? { studentId: relevantId }
        : { tenantId: relevantId };

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        ...enrollmentWhere,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { seriesId: true, courseId: true },
    });

    const enrolledSeriesIds = new Set(
      enrollments.map((e) => e.seriesId).filter(Boolean),
    );
    const enrolledCourseIds = new Set(
      enrollments.map((e) => e.courseId).filter(Boolean),
    );

    return courses.map((c) => ({
      ...c,
      isEnrolled:
        (c.seriesId != null && enrolledSeriesIds.has(c.seriesId)) ||
        enrolledCourseIds.has(c.id),
    }));
  }

  async findOne(id: string, actor: Actor) {
    const course = await this.prisma.course.findFirstOrThrow({
      where: { id, ...this.visibilityWhere(actor) },
      include: {
        lessons: { orderBy: { order: 'asc' } },
        files: true,
        speakers: { select: { id: true, name: true } },
      },
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
    const { speakerIds, ...rest } = dto;
    return this.prisma.course.create({
      data: {
        ...rest,
        startDate: toDate(dto.startDate),
        endDate: toDate(dto.endDate),
        tenantId: actor.role === Role.SUPER_ADMIN ? null : actor.tenantId,
        createdById: actor.userId,
        speakers: speakerIds
          ? { connect: speakerIds.map((id) => ({ id })) }
          : undefined,
      },
    });
  }

  async update(id: string, dto: Partial<CreateCourseDto>, actor: Actor) {
    await this.assertManageable(id, actor);
    const { speakerIds, ...rest } = dto;
    return this.prisma.course.update({
      where: { id },
      data: {
        ...rest,
        startDate: toDate(dto.startDate),
        endDate: toDate(dto.endDate),
        // set (not connect) so re-saving with a shorter list actually drops the removed speakers.
        speakers: speakerIds
          ? { set: speakerIds.map((id) => ({ id })) }
          : undefined,
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
  // drafts — no filter at all), Student sees only currently-enrolled+published — either via a
  // CourseSeries enrollment (unlocks every course under that series) or a direct Enrollment on
  // the course itself (independent of that course's series enrollment status), everyone else
  // (USER) only sees published tenant-or-global courses.
  private visibilityWhere(actor: Actor) {
    if (actor.role === Role.SUPER_ADMIN) return {};
    if (actor.role === Role.ADMIN) return { tenantId: actor.tenantId };
    if (actor.role === Role.STUDENT) {
      // studentId is not in the JWT — guard before using it in a Prisma where clause,
      // since Prisma silently ignores undefined and would match any enrollment.
      if (!actor.studentId) return { id: { in: [] as string[] } };
      const now = new Date();
      const notExpired = {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      };
      return {
        status: ContentStatus.PUBLISHED,
        OR: [
          {
            series: {
              enrollments: {
                some: { studentId: actor.studentId, ...notExpired },
              },
            },
          },
          {
            enrollments: {
              some: { studentId: actor.studentId, ...notExpired },
            },
          },
        ],
      };
    }
    return {
      status: ContentStatus.PUBLISHED,
      OR: [{ tenantId: actor.tenantId }, { tenantId: null }],
    };
  }
}
