import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserScope } from './user-scope.enum';

export class CreateUserDto {
  @IsEnum(UserScope)
  scope: UserScope;

  @IsString()
  @MinLength(1)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phoneCountryCode?: string;

  @IsString()
  @IsOptional()
  phoneNo?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  // Only read when scope=TENANT and the caller is SUPER_ADMIN — an ADMIN caller is always
  // forced to their own tenantId server-side, this field is ignored for them.
  @IsString()
  @IsOptional()
  tenantId?: string;
}
