import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ApiKeyScope =
  | 'read:interests'
  | 'write:interests'
  | 'write:source_bindings'
  | 'write:scan_requests'
  | 'read:feed'
  | 'read:summaries'
  | 'write:summaries'
  | 'read:delivery_status'
  | 'write:delivery_status'
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
    return this.rehydrate(props);
  }

  static rehydrate(props: ApiKeyProps): ApiKey {
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

    if (props.status === 'active' && props.revokedAt !== undefined) {
      throw new Error('Active API key must not have revoke time');
    }

    if (props.status === 'revoked' && props.revokedAt === undefined) {
      throw new Error('Revoked API key must include revoke time');
    }

    return new ApiKey({
      ...props,
      name: props.name.trim(),
      keyPrefix: props.keyPrefix.trim(),
      secretHash: props.secretHash.trim(),
      scopes: [...new Set(props.scopes)].sort((left, right) => left.localeCompare(right)),
    });
  }

  revoke(params: { readonly revokedAt: Date }): ApiKey {
    return ApiKey.rehydrate({
      ...this.props,
      status: 'revoked',
      revokedAt: params.revokedAt,
    });
  }

  toSnapshot(): ApiKeyProps {
    return { ...this.props };
  }
}
