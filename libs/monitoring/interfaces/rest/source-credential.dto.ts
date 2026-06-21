import { IsArray, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { DomainError } from '@social-monitor/shared-kernel';

import type { SourceCredentialKind } from '../../domain';
import type { SourceCredentialSecret } from '../../ports';
import { normalizeSourceBindingConfig } from './bind-source.dto';
import type { SourceCredentialView } from '../../features/shared/source-credential-presenter';

const sourceCredentialKinds = ['oauth2', 'api_token', 'bearer_token', 'app_oauth'] as const;

export class CreateSourceCredentialRequestDto {
  @IsString()
  @MinLength(2)
  providerKey!: string;

  @IsIn(sourceCredentialKinds)
  kind!: SourceCredentialKind;

  @IsObject()
  secret!: Readonly<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  secretPreview?: string;

  @IsOptional()
  @IsArray()
  scopes?: readonly string[];

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class RotateSourceCredentialRequestDto {
  @IsObject()
  secret!: Readonly<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  secretPreview?: string;

  @IsOptional()
  @IsArray()
  scopes?: readonly string[];

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export type SourceCredentialResponseDto = {
  readonly sourceCredential: SourceCredentialView;
};

export type ListSourceCredentialsResponseDto = {
  readonly sourceCredentials: readonly SourceCredentialView[];
  readonly nextCursor?: string;
};

export const normalizeSourceCredentialSecret = (
  secret: Readonly<Record<string, unknown>> | undefined,
): SourceCredentialSecret => {
  if (secret === undefined || Array.isArray(secret) || secret === null || typeof secret !== 'object') {
    throw new DomainError('validation.failed', 'Source credential secret must be an object');
  }

  return normalizeSourceBindingConfig(secret);
};

export const normalizeSourceCredentialScopes = (
  scopes: readonly string[] | undefined,
): readonly string[] =>
  scopes === undefined
    ? []
    : scopes.map((scope) => String(scope).trim()).filter((scope) => scope.length > 0);

export const parseSourceCredentialExpiresAt = (value: string | undefined): Date | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError('validation.failed', 'Source credential expiresAt must be an ISO date-time');
  }

  return parsed;
};
