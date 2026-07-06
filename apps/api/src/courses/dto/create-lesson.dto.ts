import { ContentStatus, VideoType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @IsEnum(VideoType)
  videoType: VideoType;

  // Required for EXTERNAL_LINK (the pasted link); ignored/unset for UPLOAD, which is
  // set server-side by the dedicated video-upload endpoint instead.
  @IsString()
  @IsOptional()
  videoUrl?: string;

  // No video-processing pipeline exists to auto-extract this, so it's entered manually.
  @IsInt()
  @Min(0)
  @IsOptional()
  durationSeconds?: number;

  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus;
}
