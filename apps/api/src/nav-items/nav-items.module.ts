import { Module } from '@nestjs/common';
import { NavItemsController } from './nav-items.controller';
import { NavItemsService } from './nav-items.service';
import { DepartmentsModule } from '../departments/departments.module';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [DepartmentsModule],
  controllers: [NavItemsController],
  providers: [NavItemsService, RolesGuard],
})
export class NavItemsModule {}
