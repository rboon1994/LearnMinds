import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  Max,
} from 'class-validator';

export class CreateAiAgentModelDto {
  @IsString()
  @MinLength(1)
  modelId: string;

  @IsString()
  @MinLength(1)
  displayName: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxTokenLimit: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inputTokenPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  outputTokenPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number;

  @IsIn(['ACTIVE', 'INACTIVE'])
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';
}
