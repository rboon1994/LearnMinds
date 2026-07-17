import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminFeatureGuard } from '../auth/guards/admin-feature.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, RolesGuard, AdminFeatureGuard],
})
export class UsersModule {}
