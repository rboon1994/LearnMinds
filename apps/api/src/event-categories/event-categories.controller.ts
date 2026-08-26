import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateEventCategoryDto } from './dto/create-event-category.dto';
import { EventCategoriesService } from './event-categories.service';

// Super-Admin-only, same as Events itself — Event Category management is a platform-operator
// concept. (The public /events page's own Category filter doesn't call this: it derives its
// options from the Events already loaded for the month, same as its Speaker filter.)
@Controller('event-categories')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class EventCategoriesController {
  constructor(private svc: EventCategoriesService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  create(@Body() dto: CreateEventCategoryDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateEventCategoryDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
