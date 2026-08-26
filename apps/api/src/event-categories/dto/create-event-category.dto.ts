import { IsString, MinLength } from 'class-validator';

export class CreateEventCategoryDto {
  @IsString()
  @MinLength(1)
  name: string;
}
