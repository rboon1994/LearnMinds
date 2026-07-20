import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AiAgentsController } from './ai-agents.controller';
import { AiAgentsService } from './ai-agents.service';

@Module({
  controllers: [AiAgentsController],
  providers: [AiAgentsService, RolesGuard],
})
export class AiAgentsModule {}
