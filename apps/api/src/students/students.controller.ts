import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BulkRegisterStudentsDto } from './dto/bulk-register-students.dto';
import { StudentsService } from './students.service';

// Super-Admin-only tool, no AdminFeatureGuard — this isn't a tenant-package-gated feature.
@Controller('students')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class StudentsController {
  constructor(private svc: StudentsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post('bulk')
  bulkRegister(@Body() dto: BulkRegisterStudentsDto) {
    return this.svc.bulkRegister(dto.students);
  }
}
