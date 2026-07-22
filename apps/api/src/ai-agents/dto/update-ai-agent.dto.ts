import { IsOptional, IsString, MinLength } from 'class-validator';

// A real class (not `Partial<CreateAiAgentDto>`) — see the identical comment on
// UpdateAiAgentModelDto for why the TS-only `Partial<T>` mapped type silently
// bypasses NestJS's ValidationPipe.
export class UpdateAiAgentDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsString()
  @MinLength(1)
  @IsOptional()
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  instructions?: string | null;

  @IsString()
  @IsOptional()
  thumbnail?: string | null;

  @IsString()
  @MinLength(1)
  @IsOptional()
  modelId?: string;

  @IsString()
  @IsOptional()
  seriesId?: string | null;

  @IsString()
  @IsOptional()
  creatorId?: string | null;

  @IsString()
  @IsOptional()
  knowledgeBaseId?: string | null;
}
