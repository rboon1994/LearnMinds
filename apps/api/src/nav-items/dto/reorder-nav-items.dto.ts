import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderNavItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
