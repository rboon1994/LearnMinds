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

// A real class (not `Partial<CreateAiAgentModelDto>`) — NestJS's ValidationPipe only validates
// when it can reflect an actual class from the parameter's design:paramtypes metadata.
// TypeScript's `Partial<T>` mapped type erases to `Object` at runtime, which the pipe
// treats as "no DTO" and silently skips validation/transformation for.
export class UpdateAiAgentModelDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  modelId?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  displayName?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxTokenLimit?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  inputTokenPrice?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  outputTokenPrice?: number;

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
