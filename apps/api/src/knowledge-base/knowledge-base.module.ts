import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OpenAiModule } from '../openai/openai.module';
import { StorageModule } from '../storage/storage.module';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';

@Module({
  imports: [StorageModule, OpenAiModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, RolesGuard],
})
export class KnowledgeBaseModule {}
