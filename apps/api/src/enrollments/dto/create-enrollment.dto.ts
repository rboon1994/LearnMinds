import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateEnrollmentDto {
  @IsString()
  @IsOptional()
  seriesId?: string;

  @IsString()
  @IsOptional()
  courseId?: string;

  @IsString()
  @IsOptional()
  agentId?: string;

  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
