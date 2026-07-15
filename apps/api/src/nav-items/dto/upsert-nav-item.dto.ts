import { TenantPackage, Status } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class UpsertNavItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @Matches(/^\/(?!\/)[\w\-\/]*(?:[?#].*)?$/)
  href: string;

  @IsString()
  icon: string;

  @IsInt()
  @IsOptional()
  order?: number;

  @IsBoolean()
  @IsOptional()
  isAdminNav?: boolean;

  @IsBoolean()
  @IsOptional()
  isAllDepts?: boolean;

  @IsBoolean()
  @IsOptional()
  isStudentVisible?: boolean;

  @IsArray()
  @IsEnum(TenantPackage, { each: true })
  packages: TenantPackage[];

  @IsEnum(Status)
  @IsOptional()
  status?: Status;
}
