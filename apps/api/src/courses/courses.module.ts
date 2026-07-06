import { Module } from '@nestjs/common';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StorageModule } from '../storage/storage.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { FilesController } from './files.controller';
import { CourseFilesService } from './files.service';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [StorageModule],
  controllers: [CoursesController, LessonsController, FilesController],
  providers: [
    CoursesService,
    LessonsService,
    CourseFilesService,
    RolesGuard,
    AdminFeatureGuard,
  ],
})
export class CoursesModule {}
