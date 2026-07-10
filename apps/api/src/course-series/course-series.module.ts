import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CourseSeriesController } from './course-series.controller';
import { CourseSeriesService } from './course-series.service';

@Module({
  controllers: [CourseSeriesController],
  providers: [CourseSeriesService, RolesGuard],
})
export class CourseSeriesModule {}
