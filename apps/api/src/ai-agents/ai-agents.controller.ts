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
import { AiAgentsService } from './ai-agents.service';
import { CreateAiAgentDto } from './dto/create-ai-agent.dto';
import { ListAiAgentsDto } from './dto/list-ai-agents.dto';
import { UpdateAiAgentDto } from './dto/update-ai-agent.dto';
import { UpdateAiAgentStatusDto } from './dto/update-ai-agent-status.dto';

// Super-Admin-only in this phase — Tenant Admins can't create/manage AI Agents yet.
@Controller('ai-agents')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class AiAgentsController {
  constructor(private svc: AiAgentsService) {}

  @Get()
  findAll(@Query() query: ListAiAgentsDto) {
    return this.svc.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAiAgentDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAiAgentDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateAiAgentStatusDto) {
    return this.svc.setStatus(id, dto.status);
  }

  // Genuine hard delete (advanced cleanup) — the everyday deactivate action is
  // PATCH /:id/status, not this.
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
