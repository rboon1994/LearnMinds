import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EventCategoriesController } from './event-categories.controller';
import { EventCategoriesService } from './event-categories.service';

@Module({
  controllers: [EventCategoriesController],
  providers: [EventCategoriesService, RolesGuard],
})
export class EventCategoriesModule {}
