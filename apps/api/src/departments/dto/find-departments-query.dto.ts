import { IsOptional, IsString } from 'class-validator';

export class FindDepartmentsQueryDto {
  @IsString()
  @IsOptional()
  tenantId?: string;
}
