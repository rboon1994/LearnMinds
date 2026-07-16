import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateEnrollmentDto {
  @IsString()
  seriesId: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
