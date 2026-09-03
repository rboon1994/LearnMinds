import { Module } from '@nestjs/common';
import { LarkApiKeyGuard } from './lark-api-key.guard';
import { LarkController } from './lark.controller';
import { LarkSyncService } from './lark-sync.service';

@Module({
  controllers: [LarkController],
  providers: [LarkSyncService, LarkApiKeyGuard],
})
export class LarkModule {}
