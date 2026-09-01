import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
} from 'class-validator';

export class BulkEnrollDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  emails: string[];

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
