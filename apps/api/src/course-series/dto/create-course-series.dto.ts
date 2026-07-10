import { IsString, MinLength } from 'class-validator';

export class CreateCourseSeriesDto {
  @IsString()
  @MinLength(1)
  name: string;
}
