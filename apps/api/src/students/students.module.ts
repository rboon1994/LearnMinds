import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MembershipsModule } from '../memberships/memberships.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [MembershipsModule],
  controllers: [StudentsController],
  providers: [StudentsService, RolesGuard],
})
export class StudentsModule {}
