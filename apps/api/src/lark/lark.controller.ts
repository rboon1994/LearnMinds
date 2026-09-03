import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { LarkMembershipRecordDto } from './dto/lark-membership-record.dto';
import { LarkApiKeyGuard } from './lark-api-key.guard';
import { LarkSyncService } from './lark-sync.service';

// Public (not JWT-authenticated) — guarded instead by LarkApiKeyGuard, a shared-secret check
// for this external system. See the design spec's security-review requirement before merge.
@Controller('integrations/lark')
@Public()
@UseGuards(LarkApiKeyGuard)
export class LarkController {
  constructor(private svc: LarkSyncService) {}

  @Post('applications')
  applications(@Body() dto: LarkMembershipRecordDto) {
    return this.svc.syncRecord(dto);
  }

  @Post('payments')
  payments(@Body() dto: LarkMembershipRecordDto) {
    return this.svc.syncRecord(dto);
  }
}
