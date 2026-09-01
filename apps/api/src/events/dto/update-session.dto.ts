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

// A real class (not `Partial<CreateSessionDto>`) — see the identical comment on
// UpdateAiAgentModelDto for why the TS-only `Partial<T>` mapped type silently bypasses
// NestJS's ValidationPipe. Cross-field checks (endDateTime > startDateTime; venue/venueMapLink/
// landingPageLink required by sessionType) are deliberately NOT decorators here — a PATCH may
// only send one side of either pair, so EventsService.updateSession merges with the existing
// row first.
export class UpdateSessionDto {
  @IsEnum(SessionType)
  @IsOptional()
  sessionType?: SessionType;

  // `null` (as opposed to omitting the field) explicitly clears the date — e.g. flipping an
  // existing dated session to WEBINAR and blanking out the date inputs. @IsOptional() treats
  // both undefined and null as "skip further validation", so this accepts either.
  @IsDateString()
  @IsOptional()
  startDateTime?: string | null;

  @IsDateString()
  @IsOptional()
  endDateTime?: string | null;

  @IsString()
  @IsOptional()
  venue?: string;

  @IsString()
  @IsOptional()
  venueMapLink?: string;

  @IsString()
  @IsOptional()
  country?: string;

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

  @IsEnum(SessionStatus)
  @IsOptional()
  status?: SessionStatus;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  speakerIds?: string[];
}
