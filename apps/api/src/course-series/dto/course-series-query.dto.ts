import { IsOptional, IsString } from 'class-validator';

export class CourseSeriesQueryDto {
  @IsString()
  @IsOptional()
  hasCourses?: string;
}
