import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { LarkMembershipRecordDto } from './lark-membership-record.dto';

export class LarkBulkSyncDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LarkMembershipRecordDto)
  records: LarkMembershipRecordDto[];
}
