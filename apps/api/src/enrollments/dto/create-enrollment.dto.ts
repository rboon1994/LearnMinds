import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateEnrollmentDto {
  @IsString()
  seriesId: string;

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
