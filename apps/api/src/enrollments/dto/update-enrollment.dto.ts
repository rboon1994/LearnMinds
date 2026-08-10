import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateEnrollmentDto {
  @IsString()
  @IsOptional()
  seriesId?: string;

  @IsString()
  @IsOptional()
  courseId?: string;

  @IsString()
  @IsOptional()
  agentId?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
