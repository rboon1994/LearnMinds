import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, RolesGuard],
})
export class EventsModule {}
