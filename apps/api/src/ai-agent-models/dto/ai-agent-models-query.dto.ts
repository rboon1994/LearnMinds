import { IsIn, IsOptional, IsString } from 'class-validator';

export class AiAgentModelsQueryDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';

  // Lets the Create/Edit-Agent dropdown keep an agent's already-selected model visible even
  // after it was later deactivated — see AiAgentModelsService.findAll for the where-clause guard.
  @IsString()
  @IsOptional()
  includeId?: string;
}
