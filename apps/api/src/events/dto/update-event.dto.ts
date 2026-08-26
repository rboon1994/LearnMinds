import { ContentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LandingContentDto } from './landing-content.dto';

// A real class (not `Partial<CreateEventDto>`) — see the identical comment on
// UpdateAiAgentModelDto for why the TS-only `Partial<T>` mapped type silently
// bypasses NestJS's ValidationPipe.
export class UpdateEventDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  title?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LandingContentDto)
  landingContent?: LandingContentDto;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  thumbnail?: string;

  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus;

  // EventCategory ids (see apps/api/src/event-categories) — admin-managed tags, not a fixed enum.
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];
}
