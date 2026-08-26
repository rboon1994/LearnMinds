import { SessionStatus, SessionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateSessionDto {
  @IsEnum(SessionType)
  sessionType: SessionType;

  // Required for ONLINE/OFFLINE, forbidden for WEBINAR (which has no calendar placement, only
  // a manual open/close) — enforced by EventsService.assertSessionInvariants, not a decorator
  // here, since UpdateSessionDto needs the identical rule and can't express it declaratively
  // (a PATCH's fields are all optional, with no sibling field to cross-check against). These
  // decorators only validate the string FORMAT when a value is actually sent.
  @IsDateString()
  @IsOptional()
  startDateTime?: string | null;

  @IsDateString()
  @IsOptional()
  endDateTime?: string | null;

  // Required for OFFLINE — see assertSessionInvariants.
  @IsString()
  @IsOptional()
  venue?: string;

  @IsString()
  @IsOptional()
  venueMapLink?: string;

  @IsString()
  @IsOptional()
  country?: string;

  // Required for WEBINAR — see assertSessionInvariants.
  @IsString()
  @IsOptional()
  landingPageLink?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  memberPrice?: number;

  // Must be OPEN/CLOSED for WEBINAR — see assertSessionInvariants.
  @IsEnum(SessionStatus)
  @IsOptional()
  status?: SessionStatus;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  speakerIds?: string[];
}
