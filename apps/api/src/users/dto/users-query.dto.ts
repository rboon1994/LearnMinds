import { Role, Status } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UserScope } from './user-scope.enum';

export class UsersQueryDto extends PaginationQueryDto {
  @IsEnum(UserScope)
  scope: UserScope;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(Status)
  @IsOptional()
  status?: Status;

  // Only meaningful for scope=platform (narrows Super Admin vs Tenant Admin); ignored otherwise.
  @IsEnum(Role)
  @IsOptional()
  role?: Role;
}
