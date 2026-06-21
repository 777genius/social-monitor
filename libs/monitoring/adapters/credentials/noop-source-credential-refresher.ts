import type {
  SourceCredentialRefreshPort,
  SourceCredentialRefreshResult,
} from '../../ports';

export class NoopSourceCredentialRefresher implements SourceCredentialRefreshPort {
  async refreshIfNeeded(
    params: Parameters<SourceCredentialRefreshPort['refreshIfNeeded']>[0],
  ): Promise<SourceCredentialRefreshResult> {
    return {
      refreshed: false,
      secret: params.secret,
      expiresAt: params.credential.toSnapshot().expiresAt,
      scopes: params.credential.toSnapshot().scopes,
    };
  }
}
