import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

@Module({
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, RolesGuard],
})
export class EnrollmentsModule {}
