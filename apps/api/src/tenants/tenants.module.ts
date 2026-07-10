import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantsController } from './tenants.controller';

@Module({
  controllers: [TenantsController],
  providers: [RolesGuard],
})
export class TenantsModule {}
