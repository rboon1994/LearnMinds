import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAiAgentDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @MinLength(1)
  systemPrompt: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @IsString()
  @IsOptional()
  thumbnail?: string;

  @IsString()
  @MinLength(1)
  modelId: string;

  @IsString()
  @IsOptional()
  seriesId?: string | null;

  @IsString()
  @IsOptional()
  creatorId?: string | null;
}
