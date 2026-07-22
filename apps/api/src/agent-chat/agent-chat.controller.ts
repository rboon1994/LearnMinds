import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AgentChatService } from './agent-chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

type AuthReq = { user: { userId: string; role: Role } };

// Any authenticated user can chat — mirrors CoursesController's student-reachable routes.
@Controller('agent-chat')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER, Role.STUDENT)
export class AgentChatController {
  constructor(private svc: AgentChatService) {}

  @Get('agents')
  findAgents() {
    return this.svc.findPublishedAgents();
  }

  @Get('conversations')
  findConversations(
    @Request() req: AuthReq,
    @Query('activeConversationId') activeConversationId?: string,
  ) {
    return this.svc.findConversations(req.user.userId, activeConversationId);
  }

  @Post('conversations')
  createConversation(
    @Request() req: AuthReq,
    @Body() dto: CreateConversationDto,
  ) {
    return this.svc.createConversation(req.user.userId, dto.agentId);
  }

  @Patch('conversations/:id')
  renameConversation(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.svc.renameConversation(req.user.userId, id, dto.title);
  }

  @Get('conversations/:id/messages')
  findMessages(@Request() req: AuthReq, @Param('id') id: string) {
    return this.svc.findMessages(req.user.userId, id);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.svc.sendMessage(req.user.userId, id, dto.content);
  }
}
