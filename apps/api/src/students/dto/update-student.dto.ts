import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateStudentDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  fullName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phoneCountryCode?: string;

  @IsString()
  @IsOptional()
  phoneNo?: string;
}
