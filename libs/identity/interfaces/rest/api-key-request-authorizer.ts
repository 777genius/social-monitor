import { Inject, Injectable } from '@nestjs/common';
import type { ApiKeyScope } from '@social-monitor/identity/domain';
import { VerifyApiKeyUseCase } from '@social-monitor/identity/features/verify-api-key/verify-api-key.use-case';
import {
  USER_ACCESS_TOKEN_VERIFIER,
  USER_WORKSPACE_MEMBERSHIP_VERIFIER,
  WORKSPACE_AUTHORIZATION_POLICY,
  type UserAccessTokenPrincipal,
  type UserAccessTokenVerifierPort,
  type UserWorkspaceMembership,
  type UserWorkspaceMembershipVerifierPort,
  type WorkspaceAction,
  type WorkspaceAuthorizationPolicyPort,
  type WorkspaceRole,
} from '@social-monitor/identity/ports';
import { DomainError, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { CheckPublicApiRateLimitUseCase } from '@social-monitor/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';

import { IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE } from './identity-provider-tokens';

export type ApiKeyRequestAuthorization = {
  readonly actorType: 'api_key';
  readonly actorId: string;
  readonly apiKeyId: string;
};

export type UserRequestAuthorization = {
  readonly actorType: 'user';
  readonly actorId: string;
  readonly userId: string;
};

export type BearerRequestAuthorization = ApiKeyRequestAuthorization | UserRequestAuthorization;

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
    @Inject(USER_ACCESS_TOKEN_VERIFIER)
    private readonly userAccessTokenVerifier: UserAccessTokenVerifierPort,
    @Inject(USER_WORKSPACE_MEMBERSHIP_VERIFIER)
    private readonly userWorkspaceMembershipVerifier: UserWorkspaceMembershipVerifierPort,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    @Inject(IDENTITY_PUBLIC_API_RATE_LIMIT_PER_MINUTE)
    private readonly publicApiRateLimitPerMinute: number,
  ) {}

  async authorize(params: AuthorizeApiKeyRequestParams): Promise<BearerRequestAuthorization> {
    const bearerToken = parseBearerToken(params.authorizationHeader);

    if (!bearerToken.startsWith('smk_')) {
      return this.authorizeUserAccessTokenRequest({
        ...params,
        bearerToken,
      });
    }

    const verifiedApiKey = await this.verifyApiKey.execute({
      secret: bearerToken,
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
      actorType: 'api_key',
      actorId: verifiedApiKey.value.apiKey.id,
      apiKeyId: verifiedApiKey.value.apiKey.id,
    };
  }

  private async authorizeUserAccessTokenRequest(
    params: AuthorizeApiKeyRequestParams & { readonly bearerToken: string },
  ): Promise<UserRequestAuthorization> {
    const principal = await this.userAccessTokenVerifier.verify(params.bearerToken);

    if (principal.tenantId !== params.tenantId || principal.workspaceId !== params.workspaceId) {
      await this.recordUserRequestAuditEvent({
        principal,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        operation: params.operation,
        requiredScope: params.requiredScope,
        outcome: 'denied',
        reasonCode: 'authorization.denied',
        membershipSource: 'unverified',
      });
      throw new DomainError('authorization.denied', 'Bearer JWT tenant or workspace does not match request scope');
    }

    const membership = await this.userWorkspaceMembershipVerifier.verify({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: principal.subject,
      tokenRoles: principal.roles,
    });

    if (membership === null) {
      await this.recordUserRequestAuditEvent({
        principal,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        operation: params.operation,
        requiredScope: params.requiredScope,
        outcome: 'denied',
        reasonCode: 'authorization.denied',
        membershipSource: 'missing',
      });
      throw new DomainError('authorization.denied', 'Bearer JWT workspace membership is missing');
    }

    const workspaceAction = resolveWorkspaceAction(params.operation, params.requiredScope);
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      action: workspaceAction,
      roles: membership.roles,
    });

    if (!authorization.ok) {
      await this.recordUserRequestAuditEvent({
        principal,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        operation: params.operation,
        requiredScope: params.requiredScope,
        outcome: 'denied',
        reasonCode: authorization.error.code,
        membershipRoles: membership.roles,
        membershipSource: membership.source,
      });
      throw authorization.error;
    }

    const rateLimit = await this.checkPublicApiRateLimit.execute({
      subjectKey: `user:${principal.subject}`,
      operation: params.operation,
      limit: this.publicApiRateLimitPerMinute,
      windowSeconds: 60,
    });

    if (!rateLimit.ok) {
      await this.recordUserRequestAuditEvent({
        principal,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        operation: params.operation,
        requiredScope: params.requiredScope,
        outcome: 'denied',
        reasonCode: rateLimit.error.code,
        membershipRoles: membership.roles,
        membershipSource: membership.source,
      });
      throw rateLimit.error;
    }

    await this.recordUserRequestAuditEvent({
      principal,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      operation: params.operation,
      requiredScope: params.requiredScope,
      outcome: 'succeeded',
      membershipRoles: membership.roles,
      membershipSource: membership.source,
    });

    return {
      actorType: 'user',
      actorId: principal.subject,
      userId: principal.subject,
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

  private async recordUserRequestAuditEvent(params: {
    readonly principal: UserAccessTokenPrincipal;
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly operation: string;
    readonly requiredScope: ApiKeyScope;
    readonly outcome: 'succeeded' | 'denied';
    readonly reasonCode?: string;
    readonly membershipRoles?: readonly WorkspaceRole[];
    readonly membershipSource?: UserWorkspaceMembership['source'] | 'missing' | 'unverified';
  }): Promise<void> {
    const auditEvent = await this.recordPublicApiAuditEvent.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorType: 'user',
      actorId: params.principal.subject,
      action: params.operation,
      outcome: params.outcome,
      reasonCode: params.reasonCode,
      resourceType: 'public_api_request',
      metadata: {
        authType: 'oidc_jwt',
        issuer: params.principal.issuer,
        audience: params.principal.audience,
        requiredScope: params.requiredScope,
        roles: params.membershipRoles ?? params.principal.roles,
        claimedRoles: params.principal.roles,
        membershipSource: params.membershipSource ?? 'unverified',
      },
    });

    if (!auditEvent.ok) {
      throw auditEvent.error;
    }
  }
}

export const hasBearerAuthorizationHeader = (authorizationHeader: string | undefined): boolean =>
  authorizationHeader !== undefined && authorizationHeader.trim().length > 0;

const parseBearerToken = (authorizationHeader: string | undefined): string => {
  const [scheme, secret, extra] = authorizationHeader?.trim().split(/\s+/) ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || secret === undefined || extra !== undefined) {
    throw new DomainError('authorization.denied', 'Bearer authorization is required');
  }

  return secret;
};

const workspaceActions = new Set<WorkspaceAction>([
  'api_keys.create',
  'api_keys.list',
  'api_keys.revoke',
  'delivery_attempts.read',
  'delivery_attempts.retry',
  'digest_schedules.create',
  'digest_schedules.read',
  'digests.read',
  'feed.read',
  'notification_preferences.read',
  'notification_preferences.write',
  'public_api_audit.read',
  'realtime_events.read',
  'scan_dead_letters.read',
  'topics.create',
  'topics.read',
  'source_bindings.create',
  'source_bindings.read',
  'source_bindings.update_status',
  'scan_policies.read',
  'scan_policies.set',
  'scan_jobs.read',
  'scan_requests.create',
  'summaries.read',
  'summary_feedback.create',
  'summary_feedback.read',
  'summary_jobs.read',
  'summary_policies.read',
  'summary_policies.set',
  'summary_requests.create',
  'summary_regenerations.create',
  'webhook_endpoints.read',
  'webhook_endpoints.create',
  'webhook_endpoints.disable',
]);

const fallbackWorkspaceActionByScope: Record<ApiKeyScope, WorkspaceAction> = {
  'read:topics': 'topics.read',
  'write:topics': 'topics.create',
  'write:source_bindings': 'source_bindings.create',
  'write:scan_requests': 'scan_requests.create',
  'read:feed': 'feed.read',
  'read:summaries': 'summaries.read',
  'write:summaries': 'summary_requests.create',
  'read:delivery_status': 'delivery_attempts.read',
  'write:delivery_status': 'delivery_attempts.retry',
  'read:webhook_endpoints': 'webhook_endpoints.read',
  'write:webhook_endpoints': 'webhook_endpoints.create',
};

const resolveWorkspaceAction = (operation: string, requiredScope: ApiKeyScope): WorkspaceAction =>
  workspaceActions.has(operation as WorkspaceAction)
    ? operation as WorkspaceAction
    : fallbackWorkspaceActionByScope[requiredScope];
