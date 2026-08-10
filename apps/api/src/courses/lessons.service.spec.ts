import { Role } from '@prisma/client';
import { LessonsService } from './lessons.service';

// recordView is the write-path for "did this user actually watch this lesson" — it must be
// impossible to fabricate a LessonView row for a lesson the caller can't see, or one that
// doesn't belong to the courseId in the URL.
describe('LessonsService.recordView', () => {
  const actor = {
    userId: 'user-1',
    tenantId: 'tenant-a',
    studentId: null,
    role: Role.USER,
  };

  function buildService() {
    const prisma = {
      lesson: { findFirstOrThrow: jest.fn() },
      $executeRaw: jest.fn(),
    };
    const courses = { assertVisible: jest.fn() };
    const storage = {};
    const service = new LessonsService(
      prisma as any,
      courses as any,
      storage as any,
    );
    return { service, prisma, courses };
  }

  it('writes a LessonView row when the actor can see the course and the lesson belongs to it', async () => {
    const { service, prisma, courses } = buildService();
    courses.assertVisible.mockResolvedValue({ id: 'course-1' });
    prisma.lesson.findFirstOrThrow.mockResolvedValue({ id: 'lesson-1' });

    await service.recordView('course-1', 'lesson-1', actor);

    expect(courses.assertVisible).toHaveBeenCalledWith('course-1', actor);
    expect(prisma.lesson.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'lesson-1', courseId: 'course-1' },
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  // The "fabricate a view via a guessed lessonId" gap: a lessonId that exists but belongs to a
  // different course must reject before any row is written.
  it('does not write a LessonView row when the lesson does not belong to the course', async () => {
    const { service, prisma, courses } = buildService();
    courses.assertVisible.mockResolvedValue({ id: 'course-1' });
    prisma.lesson.findFirstOrThrow.mockRejectedValue(
      new Error('Record not found'),
    );

    await expect(
      service.recordView('course-1', 'lesson-from-another-course', actor),
    ).rejects.toThrow('Record not found');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  // A lesson in a course the actor has no access/enrollment to must reject before any row is
  // written — assertVisible is the same check getStreamableVideo already relies on.
  it('does not write a LessonView row when the actor cannot see the course', async () => {
    const { service, prisma, courses } = buildService();
    courses.assertVisible.mockRejectedValue(new Error('Record not found'));

    await expect(
      service.recordView('course-not-visible', 'lesson-1', actor),
    ).rejects.toThrow('Record not found');
    expect(prisma.lesson.findFirstOrThrow).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
