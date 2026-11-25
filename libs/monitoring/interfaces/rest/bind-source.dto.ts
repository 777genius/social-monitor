import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import type {
  SourceBindingConfig,
  SourceBindingConfigValue,
} from '../../ports/source-binding-config-protector.port';

export class BindSourceRequestDto {
  @ApiProperty({ minLength: 2 })
  @IsString()
  @MinLength(2)
  declare readonly providerKey: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  readonly config: Readonly<Record<string, unknown>> = {};
}

export class BindSourceResponseDto {
  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly created: boolean;
}

export const normalizeSourceBindingConfig = (config: Readonly<Record<string, unknown>>): SourceBindingConfig =>
  Object.fromEntries(
    Object.entries(config)
      .filter(([key]) => key !== 'promotionAuthorityHandles')
      .map(([key, value]) => [key, normalizeConfigValue(value)]),
  );

const normalizeConfigValue = (value: unknown): SourceBindingConfigValue => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeConfigValue(item));
  }

  if (typeof value === 'object') {
    return normalizeSourceBindingConfig(value as Readonly<Record<string, unknown>>);
  }

  return String(value);
};
