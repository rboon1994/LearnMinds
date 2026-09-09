import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { LarkBulkSyncDto } from './dto/lark-bulk-sync.dto';
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

  // Per the design spec (revision #16): always 200, never the framework's default 201 for a
  // POST — Lark's side relies on the per-record result array, not the top-level status code, to
  // know what to retry. @HttpCode(200) overrides Nest's default explicitly rather than relying
  // on it being "probably fine".
  @Post('bulk-sync')
  @HttpCode(200)
  bulkSync(@Body() dto: LarkBulkSyncDto) {
    return this.svc.syncBulk(dto.records);
  }
}
