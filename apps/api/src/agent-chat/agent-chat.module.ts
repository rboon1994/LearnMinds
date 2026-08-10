import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OpenAiModule } from '../openai/openai.module';
import { StorageModule } from '../storage/storage.module';
import { AgentChatController } from './agent-chat.controller';
import { AgentChatService } from './agent-chat.service';

@Module({
  imports: [OpenAiModule, StorageModule],
  controllers: [AgentChatController],
  providers: [AgentChatService, RolesGuard],
})
export class AgentChatModule {}
