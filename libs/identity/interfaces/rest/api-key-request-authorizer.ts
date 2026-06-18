import { Inject, Injectable } from '@nestjs/common';
import type { ApiKeyScope } from '@social-monitor/identity/domain';
import { VerifyApiKeyUseCase } from '@social-monitor/identity/features/verify-api-key/verify-api-key.use-case';
import { DomainError, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { CheckPublicApiRateLimitUseCase } from '@social-monitor/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';

import { IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE } from './identity-provider-tokens';

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
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
    @Inject(IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE)
    private readonly publicApiRateLimitPerMinute: number,
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
      await this.recordApiKeyRequestAuditEvent({
        apiKeyId: verifiedApiKey.value.apiKey.id,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        operation: params.operation,
        requiredScope: params.requiredScope,
        keyPrefix: verifiedApiKey.value.apiKey.keyPrefix,
        outcome: 'denied',
        reasonCode: 'authorization.denied',
      });
      throw new DomainError('authorization.denied', 'API key tenant or workspace does not match request scope');
    }

    const rateLimit = await this.checkPublicApiRateLimit.execute({
      subjectKey: `api-key:${verifiedApiKey.value.apiKey.id}`,
      operation: params.operation,
      limit: this.publicApiRateLimitPerMinute,
      windowSeconds: 60,
    });

    if (!rateLimit.ok) {
      await this.recordApiKeyRequestAuditEvent({
        apiKeyId: verifiedApiKey.value.apiKey.id,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        operation: params.operation,
        requiredScope: params.requiredScope,
        keyPrefix: verifiedApiKey.value.apiKey.keyPrefix,
        outcome: 'denied',
        reasonCode: rateLimit.error.code,
      });
      throw rateLimit.error;
    }

    await this.recordApiKeyRequestAuditEvent({
      apiKeyId: verifiedApiKey.value.apiKey.id,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      operation: params.operation,
      requiredScope: params.requiredScope,
      keyPrefix: verifiedApiKey.value.apiKey.keyPrefix,
      outcome: 'succeeded',
    });

    return {
      apiKeyId: verifiedApiKey.value.apiKey.id,
    };
  }

  private async recordApiKeyRequestAuditEvent(params: {
    readonly apiKeyId: string;
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly operation: string;
    readonly requiredScope: ApiKeyScope;
    readonly keyPrefix: string;
    readonly outcome: 'succeeded' | 'denied';
    readonly reasonCode?: string;
  }): Promise<void> {
    const auditEvent = await this.recordPublicApiAuditEvent.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorType: 'api_key',
      actorId: params.apiKeyId,
      action: params.operation,
      outcome: params.outcome,
      reasonCode: params.reasonCode,
      resourceType: 'public_api_request',
      metadata: {
        requiredScope: params.requiredScope,
        keyPrefix: params.keyPrefix,
      },
    });

    if (!auditEvent.ok) {
      throw auditEvent.error;
    }
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
