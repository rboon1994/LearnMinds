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
import { CreateSpeakerDto } from './dto/create-speaker.dto';
import { SpeakersQueryDto } from './dto/speakers-query.dto';
import { SpeakersService } from './speakers.service';

// Super-Admin-only tool, no AdminFeatureGuard — this isn't a tenant-package-gated feature.
@Controller('speakers')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class SpeakersController {
  constructor(private svc: SpeakersService) {}

  @Get()
  findAll(@Query() query: SpeakersQueryDto) {
    return this.svc.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSpeakerDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateSpeakerDto>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
