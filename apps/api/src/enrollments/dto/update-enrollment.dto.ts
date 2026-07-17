import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateEnrollmentDto {
  @IsString()
  @IsOptional()
  seriesId?: string;

  @IsString()
  @IsOptional()
  courseId?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
