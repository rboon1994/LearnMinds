import { ContentStatus } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  thumbnail?: string;

  // Display-only: when the recorded event took place, not used for sorting or "upcoming" logic.
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus;

  @IsString()
  @IsOptional()
  seriesId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  speakerIds?: string[];
}
