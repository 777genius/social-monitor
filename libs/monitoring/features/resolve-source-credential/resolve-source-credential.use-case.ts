import { type Clock, DomainError, err, ok } from '@social-monitor/shared-kernel';

import type {
  SourceCredentialRepositoryPort,
  SourceCredentialRefreshPort,
  SourceCredentialResolverPort,
  SourceCredentialVaultPort,
} from '../../ports';

export class ResolveSourceCredentialUseCase implements SourceCredentialResolverPort {
  constructor(
    private readonly credentials: SourceCredentialRepositoryPort,
    private readonly vault: SourceCredentialVaultPort,
    private readonly refresher: SourceCredentialRefreshPort,
    private readonly clock: Clock,
  ) {}

  async resolve(params: Parameters<SourceCredentialResolverPort['resolve']>[0]): ReturnType<SourceCredentialResolverPort['resolve']> {
    const credential = await this.credentials.findById({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      sourceCredentialId: params.sourceCredentialId,
    });

    if (credential === null) {
      return err(new DomainError('resource.not_found', 'Source credential not found', {
        sourceCredentialId: params.sourceCredentialId,
      }));
    }

    const snapshot = credential.toSnapshot();
    if (params.providerKey !== undefined && snapshot.providerKey !== params.providerKey) {
      return err(new DomainError('authorization.denied', 'Source credential provider does not match source binding', {
        sourceCredentialId: snapshot.id,
        expectedProviderKey: params.providerKey,
        credentialProviderKey: snapshot.providerKey,
      }));
    }

    const now = this.clock.now();
    if (snapshot.status !== 'active') {
      return err(new DomainError('authorization.denied', 'Source credential is not usable', {
        sourceCredentialId: snapshot.id,
        status: snapshot.status,
      }));
    }

    const secret = await this.vault.get({ secretKeyId: snapshot.secretKeyId });
    if (secret === null) {
      return err(new DomainError('external.dependency_unavailable', 'Source credential secret is unavailable', {
        sourceCredentialId: snapshot.id,
        secretKeyId: snapshot.secretKeyId,
      }));
    }

    const refresh = await this.refreshCredential({ credential, secret, now });
    if (!refresh.ok) {
      return refresh;
    }

    const refreshValue = refresh.value;
    if (refreshValue.refreshed) {
      const refreshedCredential = credential.refresh({
        scopes: refreshValue.scopes,
        expiresAt: refreshValue.expiresAt,
        now,
      });

      await this.vault.put({
        secretKeyId: snapshot.secretKeyId,
        secret: refreshValue.secret,
      });
      await this.credentials.save(refreshedCredential);

      if (!refreshedCredential.isUsableAt(now)) {
        return err(new DomainError('authorization.denied', 'Source credential refresh did not produce a usable credential', {
          sourceCredentialId: snapshot.id,
          status: refreshedCredential.toSnapshot().status,
        }));
      }

      return ok(refreshValue.secret);
    }

    if (!credential.isUsableAt(now)) {
      return err(new DomainError('authorization.denied', 'Source credential is not usable', {
        sourceCredentialId: snapshot.id,
        status: snapshot.status,
      }));
    }

    return ok(secret);
  }

  private async refreshCredential(params: Parameters<SourceCredentialRefreshPort['refreshIfNeeded']>[0]) {
    try {
      return ok(await this.refresher.refreshIfNeeded(params));
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Unknown source credential refresh failure'));
    }
  }
}
