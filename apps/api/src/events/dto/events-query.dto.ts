import { IsOptional, IsString, Matches } from 'class-validator';

export class EventsQueryDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format',
  })
  @IsOptional()
  month?: string;

  // An EventCategory id (see apps/api/src/event-categories) — not a fixed enum anymore.
  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  country?: string;
}
