import { ContentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus;
}
