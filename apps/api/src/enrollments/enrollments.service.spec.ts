import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EnrollmentsService } from './enrollments.service';

// Mocked-Prisma unit tests, matching the existing courses.service.spec.ts pattern in this repo.
// Covers the seriesId/courseId exclusivity added for course-level enrollment, and the
// server-side type-lock on update() that stops an enrollment from being flipped between Series
// and Course via a direct API call (the Edit dialog only hides the option client-side, it
// doesn't enforce it).
describe('EnrollmentsService', () => {
  function buildService() {
    const prisma = {
      enrollment: {
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
    };
    const service = new EnrollmentsService(prisma as any);
    return { service, prisma };
  }

  describe('create', () => {
    it('rejects neither seriesId nor courseId', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.create({ studentId: 'student-1' }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.enrollment.create).not.toHaveBeenCalled();
    });

    it('rejects both seriesId and courseId', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.create(
          {
            studentId: 'student-1',
            seriesId: 'series-1',
            courseId: 'course-1',
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.enrollment.create).not.toHaveBeenCalled();
    });

    it('creates a course-level enrollment independent of any series', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.create.mockResolvedValue({
        id: 'enr-1',
        courseId: 'course-1',
        seriesId: null,
      });
      await service.create(
        { studentId: 'student-1', courseId: 'course-1' },
        'admin-1',
      );
      expect(prisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            courseId: 'course-1',
            seriesId: undefined,
          }),
        }),
      );
    });

    it('rejects all three of seriesId, courseId, and agentId set at once', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.create(
          {
            studentId: 'student-1',
            seriesId: 'series-1',
            courseId: 'course-1',
            agentId: 'agent-1',
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.enrollment.create).not.toHaveBeenCalled();
    });

    it('creates a direct agent enrollment independent of any series or course', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.create.mockResolvedValue({
        id: 'enr-1',
        agentId: 'agent-1',
        seriesId: null,
        courseId: null,
      });
      await service.create(
        { studentId: 'student-1', agentId: 'agent-1' },
        'admin-1',
      );
      expect(prisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: 'agent-1',
            seriesId: undefined,
            courseId: undefined,
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('rejects flipping a series enrollment into a course enrollment', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.findUniqueOrThrow.mockResolvedValue({
        seriesId: 'series-1',
        courseId: null,
        agentId: null,
      });
      await expect(
        service.update('enr-1', { courseId: 'course-1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.enrollment.update).not.toHaveBeenCalled();
    });

    it('rejects flipping a course enrollment into a series enrollment', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.findUniqueOrThrow.mockResolvedValue({
        seriesId: null,
        courseId: 'course-1',
        agentId: null,
      });
      await expect(
        service.update('enr-1', { seriesId: 'series-1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.enrollment.update).not.toHaveBeenCalled();
    });

    it('rejects flipping an agent enrollment into a series enrollment', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.findUniqueOrThrow.mockResolvedValue({
        seriesId: null,
        courseId: null,
        agentId: 'agent-1',
      });
      await expect(
        service.update('enr-1', { seriesId: 'series-1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.enrollment.update).not.toHaveBeenCalled();
    });

    it('rejects flipping a series enrollment into an agent enrollment', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.findUniqueOrThrow.mockResolvedValue({
        seriesId: 'series-1',
        courseId: null,
        agentId: null,
      });
      await expect(
        service.update('enr-1', { agentId: 'agent-1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.enrollment.update).not.toHaveBeenCalled();
    });

    it('allows changing which agent a direct agent enrollment points to', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.findUniqueOrThrow.mockResolvedValue({
        seriesId: null,
        courseId: null,
        agentId: 'agent-1',
      });
      prisma.enrollment.update.mockResolvedValue({
        id: 'enr-1',
        agentId: 'agent-2',
      });
      await service.update('enr-1', { agentId: 'agent-2' });
      expect(prisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agentId: 'agent-2' }),
        }),
      );
    });

    it('allows changing which series a series-based enrollment points to', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.findUniqueOrThrow.mockResolvedValue({
        seriesId: 'series-1',
        courseId: null,
        agentId: null,
      });
      prisma.enrollment.update.mockResolvedValue({
        id: 'enr-1',
        seriesId: 'series-2',
      });
      await service.update('enr-1', { seriesId: 'series-2' });
      expect(prisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            seriesId: 'series-2',
            courseId: undefined,
          }),
        }),
      );
    });

    it('an explicit null for the inactive field is not mistaken for a type switch', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.findUniqueOrThrow.mockResolvedValue({
        seriesId: 'series-1',
        courseId: null,
        agentId: null,
      });
      prisma.enrollment.update.mockResolvedValue({
        id: 'enr-1',
        seriesId: 'series-1',
      });
      await expect(
        service.update('enr-1', {
          seriesId: 'series-1',
          courseId: null as unknown as undefined,
        }),
      ).resolves.toBeDefined();
      expect(prisma.enrollment.update).toHaveBeenCalled();
    });
  });

  describe('bulkEnroll', () => {
    it('rejects when the target is not exactly one of seriesId/courseId/agentId', async () => {
      const { service } = buildService();
      await expect(
        service.bulkEnroll({ emails: ['a@example.com'] }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.bulkEnroll(
          { emails: ['a@example.com'], seriesId: 's-1', courseId: 'c-1' },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('skips a row whose email matches no Student', async () => {
      const { service, prisma } = buildService();
      prisma.user.findFirst.mockResolvedValue(null);
      const results = await service.bulkEnroll(
        { emails: ['nobody@example.com'], seriesId: 's-1' },
        'admin-1',
      );
      expect(results).toEqual([
        { email: 'nobody@example.com', status: 'skipped', reason: 'Student not found' },
      ]);
      expect(prisma.enrollment.create).not.toHaveBeenCalled();
    });

    it('skips the second occurrence of a duplicate email within the same file without re-querying', async () => {
      const { service, prisma } = buildService();
      prisma.user.findFirst.mockResolvedValue({ studentId: 'student-1' });
      prisma.enrollment.create.mockResolvedValue({ id: 'enr-1' });
      const results = await service.bulkEnroll(
        { emails: ['jane@example.com', 'jane@example.com'], seriesId: 's-1' },
        'admin-1',
      );
      expect(results).toEqual([
        { email: 'jane@example.com', status: 'created' },
        { email: 'jane@example.com', status: 'skipped', reason: 'Duplicate email in file' },
      ]);
      expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.enrollment.create).toHaveBeenCalledTimes(1);
    });

    it('creates an enrollment for a matched student', async () => {
      const { service, prisma } = buildService();
      prisma.user.findFirst.mockResolvedValue({ studentId: 'student-1' });
      prisma.enrollment.create.mockResolvedValue({ id: 'enr-1' });
      const results = await service.bulkEnroll(
        { emails: ['jane@example.com'], courseId: 'course-1' },
        'admin-1',
      );
      expect(results).toEqual([{ email: 'jane@example.com', status: 'created' }]);
      expect(prisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ studentId: 'student-1', courseId: 'course-1' }),
        }),
      );
    });

    it('reports an already-enrolled student as skipped instead of throwing', async () => {
      const { service, prisma } = buildService();
      prisma.user.findFirst.mockResolvedValue({ studentId: 'student-1' });
      const p2002 = Object.assign(new Error('conflict'), { code: 'P2002' });
      Object.setPrototypeOf(p2002, Prisma.PrismaClientKnownRequestError.prototype);
      prisma.enrollment.create.mockRejectedValue(p2002);
      const results = await service.bulkEnroll(
        { emails: ['jane@example.com'], agentId: 'agent-1' },
        'admin-1',
      );
      expect(results).toEqual([
        { email: 'jane@example.com', status: 'skipped', reason: 'Already enrolled' },
      ]);
    });
  });
});
