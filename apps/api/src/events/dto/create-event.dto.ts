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

export class CreateEventDto {
  @IsString()
  @MinLength(1)
  title: string;

  // Optional on create — the admin "create event" dialog doesn't collect this at all; the
  // Prisma column default covers the gap until the admin's first save on the edit page.
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
