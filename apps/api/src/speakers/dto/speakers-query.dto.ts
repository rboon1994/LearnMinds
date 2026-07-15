import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class SpeakersQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  search?: string;
}
