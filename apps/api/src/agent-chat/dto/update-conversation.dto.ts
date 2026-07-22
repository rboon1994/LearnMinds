import { IsString } from 'class-validator';

export class UpdateConversationDto {
  // Empty/blank is allowed on purpose — it means "clear the custom name, fall back to the
  // agent's name" rather than being rejected as invalid input.
  @IsString()
  title: string;
}
