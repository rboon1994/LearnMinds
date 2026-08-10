import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const SORTABLE_FIELDS = ['name', 'status', 'createdAt', 'updatedAt'] as const;

export class ListAiAgentsDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsIn(['DRAFT', 'PUBLISHED'])
  @IsOptional()
  status?: 'DRAFT' | 'PUBLISHED';

  @IsIn(SORTABLE_FIELDS)
  @IsOptional()
  sortBy?: (typeof SORTABLE_FIELDS)[number];

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortDir?: 'asc' | 'desc';

  // Boolean-as-string, matching CourseSeriesQueryDto.hasCourses's convention — used by the
  // Enrollments admin page to list only series-less agents (only those need a *direct*
  // Enrollment; series-linked agents are covered by their series' Enrollment already).
  @IsIn(['true', 'false'])
  @IsOptional()
  hasSeries?: 'true' | 'false';
}
