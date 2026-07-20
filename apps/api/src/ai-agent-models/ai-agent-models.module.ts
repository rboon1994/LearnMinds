import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AiAgentModelsController } from './ai-agent-models.controller';
import { AiAgentModelsService } from './ai-agent-models.service';

@Module({
  controllers: [AiAgentModelsController],
  providers: [AiAgentModelsService, RolesGuard],
  exports: [AiAgentModelsService],
})
export class AiAgentModelsModule {}
