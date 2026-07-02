import { TenantPackage, Status } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertAdminFeatureDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  key: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsEnum(TenantPackage, { each: true })
  packages: TenantPackage[];

  @IsEnum(Status)
  @IsOptional()
  status?: Status;
}
