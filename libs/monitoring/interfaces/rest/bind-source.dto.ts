import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class BindSourceRequestDto {
  @IsString()
  @MinLength(2)
  providerKey!: string;

  @IsOptional()
  @IsObject()
  config: Readonly<Record<string, unknown>> = {};
}

export type BindSourceResponseDto = {
  readonly sourceBindingId: string;
  readonly created: boolean;
};
