import { Inject, Injectable } from '@nestjs/common';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAction,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type DeliveryReadAuthorizationParams = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly workspaceRoleHeader: string | undefined;
  readonly authorizationHeader: string | undefined;
  readonly action: WorkspaceAction;
  readonly operation: string;
};

@Injectable()
export class DeliveryReadAuthorizer {
  constructor(
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  async authorize(params: DeliveryReadAuthorizationParams): Promise<void> {
    if (hasBearerAuthorizationHeader(params.authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader: params.authorizationHeader,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        requiredScope: 'read:delivery_status',
        operation: params.operation,
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      action: params.action,
      roles: parseWorkspaceRolesHeader(params.workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
