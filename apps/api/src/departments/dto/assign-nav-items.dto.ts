import { IsArray, IsString } from 'class-validator';

export class AssignNavItemsDto {
  @IsArray()
  @IsString({ each: true })
  navItemIds: string[];
}
