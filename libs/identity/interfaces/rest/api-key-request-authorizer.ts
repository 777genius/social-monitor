import { Injectable } from '@nestjs/common';
import type { ApiKeyScope } from '@social-monitor/identity/domain';
import { VerifyApiKeyUseCase } from '@social-monitor/identity/features/verify-api-key/verify-api-key.use-case';
import { DomainError, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { CheckPublicApiRateLimitUseCase } from '@social-monitor/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';

export type ApiKeyRequestAuthorization = {
  readonly apiKeyId: string;
};

export type AuthorizeApiKeyRequestParams = {
  readonly authorizationHeader: string | undefined;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly requiredScope: ApiKeyScope;
  readonly operation: string;
};

@Injectable()
export class ApiKeyRequestAuthorizer {
  constructor(
    private readonly verifyApiKey: VerifyApiKeyUseCase,
    private readonly checkPublicApiRateLimit: CheckPublicApiRateLimitUseCase,
  ) {}

  async authorize(params: AuthorizeApiKeyRequestParams): Promise<ApiKeyRequestAuthorization> {
    const verifiedApiKey = await this.verifyApiKey.execute({
      secret: parseBearerSecret(params.authorizationHeader),
      requiredScope: params.requiredScope,
    });

    if (!verifiedApiKey.ok) {
      throw verifiedApiKey.error;
    }

    if (
      verifiedApiKey.value.apiKey.tenantId !== params.tenantId ||
      verifiedApiKey.value.apiKey.workspaceId !== params.workspaceId
    ) {
      throw new DomainError('authorization.denied', 'API key tenant or workspace does not match request scope');
    }

    const rateLimit = await this.checkPublicApiRateLimit.execute({
      subjectKey: `api-key:${verifiedApiKey.value.apiKey.id}`,
      operation: params.operation,
      limit: publicApiRateLimitPerMinute(),
      windowSeconds: 60,
    });

    if (!rateLimit.ok) {
      throw rateLimit.error;
    }

    return {
      apiKeyId: verifiedApiKey.value.apiKey.id,
    };
  }
}

export const hasBearerAuthorizationHeader = (authorizationHeader: string | undefined): boolean =>
  authorizationHeader !== undefined && authorizationHeader.trim().length > 0;

const parseBearerSecret = (authorizationHeader: string | undefined): string => {
  const [scheme, secret, extra] = authorizationHeader?.trim().split(/\s+/) ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || secret === undefined || extra !== undefined) {
    throw new DomainError('authorization.denied', 'Bearer API key is required');
  }

  return secret;
};

const publicApiRateLimitPerMinute = (): number => {
  const configured = Number(process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE);

  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return 60;
};
