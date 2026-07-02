import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService, RolesGuard, AdminFeatureGuard],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
