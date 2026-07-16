import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BulkRegisterStudentsDto } from './dto/bulk-register-students.dto';
import { StudentsQueryDto } from './dto/students-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

// Super-Admin-only tool, no AdminFeatureGuard — this isn't a tenant-package-gated feature.
@Controller('students')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class StudentsController {
  constructor(private svc: StudentsService) {}

  @Get()
  findAll(@Query() query: StudentsQueryDto) {
    return this.svc.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post('bulk')
  bulkRegister(@Body() dto: BulkRegisterStudentsDto) {
    return this.svc.bulkRegister(dto.students);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  @Patch(':id/reset-password')
  resetPassword(@Param('id') id: string) {
    return this.svc.resetPassword(id);
  }
}
