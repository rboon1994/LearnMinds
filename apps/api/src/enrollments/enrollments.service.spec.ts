import { BadRequestException } from '@nestjs/common';
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
  });

  describe('update', () => {
    it('rejects flipping a series enrollment into a course enrollment', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.findUniqueOrThrow.mockResolvedValue({
        seriesId: 'series-1',
        courseId: null,
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
      });
      await expect(
        service.update('enr-1', { seriesId: 'series-1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.enrollment.update).not.toHaveBeenCalled();
    });

    it('allows changing which series a series-based enrollment points to', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.findUniqueOrThrow.mockResolvedValue({
        seriesId: 'series-1',
        courseId: null,
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
});
