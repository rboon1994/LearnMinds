import { IsOptional, IsString } from 'class-validator';

export class CreateMessageDto {
  // Optional — a message can be attachment-only (e.g. just an image, no text), same as
  // ChatGPT's attach flow. AgentChatService.sendMessage rejects the request if both content and
  // attachments end up empty.
  @IsOptional()
  @IsString()
  content?: string;
}
