import { IsArray, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DomainError } from '@social-monitor/shared-kernel';

import type { SourceCredentialKind, SourceCredentialStatus } from '../../domain';
import type { SourceCredentialSecret } from '../../ports';
import { normalizeSourceBindingConfig } from './bind-source.dto';
import type { SourceCredentialView } from '../../features/shared/source-credential-presenter';

const sourceCredentialKinds = ['oauth2', 'api_token', 'bearer_token', 'app_oauth'] as const;
const sourceCredentialStatuses = ['active', 'revoked', 'expired'] as const satisfies readonly SourceCredentialStatus[];

export class CreateSourceCredentialRequestDto {
  @ApiProperty({ minLength: 2 })
  @IsString()
  @MinLength(2)
  providerKey!: string;

  @ApiProperty({ enum: sourceCredentialKinds })
  @IsIn(sourceCredentialKinds)
  kind!: SourceCredentialKind;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  secret!: Readonly<Record<string, unknown>>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secretPreview?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  scopes?: readonly string[];

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class RotateSourceCredentialRequestDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  secret!: Readonly<Record<string, unknown>>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secretPreview?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  scopes?: readonly string[];

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class SourceCredentialViewDto implements SourceCredentialView {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly tenantId: SourceCredentialView['tenantId'];

  @ApiProperty()
  declare readonly workspaceId: SourceCredentialView['workspaceId'];

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty({ enum: sourceCredentialKinds })
  declare readonly kind: SourceCredentialKind;

  @ApiProperty({ enum: sourceCredentialStatuses })
  declare readonly status: SourceCredentialStatus;

  @ApiProperty()
  declare readonly secretPreview: string;

  @ApiProperty({ type: [String] })
  declare readonly scopes: readonly string[];

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly expiresAt?: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly createdAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly updatedAt: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly rotatedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly revokedAt?: string;
}

export class SourceCredentialResponseDto {
  @ApiProperty({ type: () => SourceCredentialViewDto })
  declare readonly sourceCredential: SourceCredentialViewDto;
}

export class ListSourceCredentialsResponseDto {
  @ApiProperty({ type: () => [SourceCredentialViewDto] })
  declare readonly sourceCredentials: readonly SourceCredentialViewDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}

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
