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
import { AiAgentModelsService } from './ai-agent-models.service';
import { AiAgentModelsQueryDto } from './dto/ai-agent-models-query.dto';
import { CreateAiAgentModelDto } from './dto/create-ai-agent-model.dto';
import { UpdateAiAgentModelDto } from './dto/update-ai-agent-model.dto';

// Super-Admin-only platform catalog, no AdminFeatureGuard — same tier as CourseSeries/Speakers.
@Controller('ai-agent-models')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class AiAgentModelsController {
  constructor(private svc: AiAgentModelsService) {}

  @Get()
  findAll(@Query() query: AiAgentModelsQueryDto) {
    return this.svc.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAiAgentModelDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAiAgentModelDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/default')
  setDefault(@Param('id') id: string) {
    return this.svc.setDefault(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}
