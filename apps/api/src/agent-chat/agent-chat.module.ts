import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OpenAiModule } from '../openai/openai.module';
import { AgentChatController } from './agent-chat.controller';
import { AgentChatService } from './agent-chat.service';

@Module({
  imports: [OpenAiModule],
  controllers: [AgentChatController],
  providers: [AgentChatService, RolesGuard],
})
export class AgentChatModule {}
