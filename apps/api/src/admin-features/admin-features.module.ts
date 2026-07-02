import { Module } from '@nestjs/common';
import { AdminFeaturesController } from './admin-features.controller';
import { AdminFeaturesService } from './admin-features.service';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  controllers: [AdminFeaturesController],
  providers: [AdminFeaturesService, RolesGuard],
})
export class AdminFeaturesModule {}
