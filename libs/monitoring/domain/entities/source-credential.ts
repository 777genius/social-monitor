import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SourceCredentialKind = 'oauth2' | 'api_token' | 'bearer_token' | 'app_oauth';
export type SourceCredentialStatus = 'active' | 'revoked' | 'expired';

export type SourceCredentialProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly providerKey: string;
  readonly kind: SourceCredentialKind;
  readonly status: SourceCredentialStatus;
  readonly secretKeyId: string;
  readonly secretPreview: string;
  readonly scopes: readonly string[];
  readonly expiresAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly rotatedAt?: Date;
  readonly revokedAt?: Date;
};

export class SourceCredential {
  private constructor(private readonly props: SourceCredentialProps) {}

  static create(props: Omit<SourceCredentialProps, 'status' | 'updatedAt' | 'rotatedAt' | 'revokedAt'>): SourceCredential {
    validateProviderKey(props.providerKey);
    validateSecretKeyId(props.secretKeyId);

    return new SourceCredential({
      ...props,
      providerKey: props.providerKey.trim(),
      scopes: normalizeScopes(props.scopes),
      status: 'active',
      updatedAt: props.createdAt,
    });
  }

  static rehydrate(props: SourceCredentialProps): SourceCredential {
    validateProviderKey(props.providerKey);
    validateSecretKeyId(props.secretKeyId);

    return new SourceCredential({
      ...props,
      providerKey: props.providerKey.trim(),
      scopes: normalizeScopes(props.scopes),
    });
  }

  rotate(params: {
    readonly secretKeyId: string;
    readonly secretPreview: string;
    readonly scopes: readonly string[];
    readonly expiresAt?: Date;
    readonly now: Date;
  }): SourceCredential {
    this.assertActive('rotate');
    validateSecretKeyId(params.secretKeyId);

    return new SourceCredential({
      ...this.props,
      secretKeyId: params.secretKeyId,
      secretPreview: params.secretPreview,
      scopes: normalizeScopes(params.scopes),
      expiresAt: params.expiresAt,
      updatedAt: params.now,
      rotatedAt: params.now,
    });
  }

  refresh(params: {
    readonly scopes?: readonly string[];
    readonly expiresAt?: Date;
    readonly now: Date;
  }): SourceCredential {
    this.assertActive('refresh');

    return new SourceCredential({
      ...this.props,
      scopes: params.scopes === undefined ? this.props.scopes : normalizeScopes(params.scopes),
      expiresAt: params.expiresAt,
      updatedAt: params.now,
    });
  }

  revoke(params: { readonly now: Date }): SourceCredential {
    if (this.props.status === 'revoked') {
      return this;
    }

    return new SourceCredential({
      ...this.props,
      status: 'revoked',
      updatedAt: params.now,
      revokedAt: params.now,
    });
  }

  markExpired(params: { readonly now: Date }): SourceCredential {
    if (this.props.status === 'expired') {
      return this;
    }

    return new SourceCredential({
      ...this.props,
      status: 'expired',
      updatedAt: params.now,
    });
  }

  isUsableAt(now: Date): boolean {
    return this.props.status === 'active' &&
      (this.props.expiresAt === undefined || this.props.expiresAt.getTime() > now.getTime());
  }

  toSnapshot(): SourceCredentialProps {
    return { ...this.props };
  }

  private assertActive(operation: string): void {
    if (this.props.status !== 'active') {
      throw new Error(`Cannot ${operation} ${this.props.status} source credential`);
    }
  }
}

const validateProviderKey = (providerKey: string): void => {
  if (providerKey.trim().length === 0) {
    throw new Error('Source credential provider key must be non-empty');
  }
};

const validateSecretKeyId = (secretKeyId: string): void => {
  if (secretKeyId.trim().length === 0) {
    throw new Error('Source credential secret key id must be non-empty');
  }
};

const normalizeScopes = (scopes: readonly string[]): readonly string[] =>
  [...new Set(scopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0))]
    .sort((left, right) => left.localeCompare(right));
