import { IsString, MinLength } from 'class-validator';

export class CreateTopicRequestDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  query!: string;
}

export type CreateTopicResponseDto = {
  readonly topicId: string;
  readonly created: boolean;
};
