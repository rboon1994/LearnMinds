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
import { CourseSeriesService } from './course-series.service';
import { CourseSeriesQueryDto } from './dto/course-series-query.dto';
import { CreateCourseSeriesDto } from './dto/create-course-series.dto';

// Super-Admin-only, per explicit decision — Course Series grouping/enrollment is a
// platform-operator concept, not something Tenant Admins manage.
@Controller('course-series')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class CourseSeriesController {
  constructor(private svc: CourseSeriesService) {}

  @Get()
  findAll(@Query() query: CourseSeriesQueryDto) {
    return this.svc.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateCourseSeriesDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateCourseSeriesDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
