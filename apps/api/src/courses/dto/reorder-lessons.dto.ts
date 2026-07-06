import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderLessonsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
