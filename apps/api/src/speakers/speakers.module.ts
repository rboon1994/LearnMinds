import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SpeakersController } from './speakers.controller';
import { SpeakersService } from './speakers.service';

@Module({
  controllers: [SpeakersController],
  providers: [SpeakersService, RolesGuard],
})
export class SpeakersModule {}
