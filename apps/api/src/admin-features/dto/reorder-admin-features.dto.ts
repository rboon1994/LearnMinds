import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderAdminFeaturesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
