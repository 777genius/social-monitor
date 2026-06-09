import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ApiKeyScope =
  | 'read:topics'
  | 'read:feed'
  | 'read:summaries'
  | 'read:delivery_status'
  | 'read:webhook_endpoints'
  | 'write:webhook_endpoints';

export type ApiKeyStatus = 'active' | 'revoked';

export type ApiKeyProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly keyPrefix: string;
  readonly secretHash: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly status: ApiKeyStatus;
  readonly createdAt: Date;
  readonly revokedAt?: Date;
};

export class ApiKey {
  private constructor(private readonly props: ApiKeyProps) {}

  static create(props: ApiKeyProps): ApiKey {
    if (props.id.trim().length === 0) {
      throw new Error('API key id must be non-empty');
    }

    if (props.name.trim().length === 0) {
      throw new Error('API key name must be non-empty');
    }

    if (props.keyPrefix.trim().length < 8 || props.secretHash.trim().length === 0) {
      throw new Error('API key secret metadata must be valid');
    }

    if (props.scopes.length === 0) {
      throw new Error('API key must include at least one scope');
    }

    return new ApiKey({
      ...props,
      scopes: [...new Set(props.scopes)].sort((left, right) => left.localeCompare(right)),
    });
  }

  revoke(params: { readonly revokedAt: Date }): ApiKey {
    return new ApiKey({
      ...this.props,
      status: 'revoked',
      revokedAt: params.revokedAt,
    });
  }

  toSnapshot(): ApiKeyProps {
    return { ...this.props };
  }
}
