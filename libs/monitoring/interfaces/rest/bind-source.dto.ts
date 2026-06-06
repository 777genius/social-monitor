import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import type {
  SourceBindingConfig,
  SourceBindingConfigValue,
} from '../../ports/source-binding-config-protector.port';

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

export const normalizeSourceBindingConfig = (config: Readonly<Record<string, unknown>>): SourceBindingConfig =>
  Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, normalizeConfigValue(value)]),
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
