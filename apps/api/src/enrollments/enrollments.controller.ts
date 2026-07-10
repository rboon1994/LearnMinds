import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

type AuthReq = { user: { userId: string } };

// Super-Admin-only — enrollment grants a Student/Tenant access to an entire CourseSeries.
@Controller('enrollments')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class EnrollmentsController {
  constructor(private svc: EnrollmentsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  create(@Body() dto: CreateEnrollmentDto, @Request() req: AuthReq) {
    return this.svc.create(dto, req.user.userId);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
