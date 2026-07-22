import { IsOptional, IsString, MinLength } from 'class-validator';

// A real class (not `Partial<CreateKnowledgeBaseDto>`) — see the identical comment on
// UpdateAiAgentDto for why the TS-only `Partial<T>` mapped type silently bypasses NestJS's
// ValidationPipe.
export class UpdateKnowledgeBaseDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string | null;
}
