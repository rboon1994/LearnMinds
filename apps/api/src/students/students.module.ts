import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  controllers: [StudentsController],
  providers: [StudentsService, RolesGuard],
})
export class StudentsModule {}
