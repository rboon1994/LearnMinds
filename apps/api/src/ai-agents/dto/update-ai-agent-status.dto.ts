import { IsIn } from 'class-validator';

export class UpdateAiAgentStatusDto {
  @IsIn(['DRAFT', 'PUBLISHED'])
  status: 'DRAFT' | 'PUBLISHED';
}
