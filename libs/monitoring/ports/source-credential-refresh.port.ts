import type { SourceCredential } from '../domain';
import type { SourceCredentialSecret } from './source-credential-vault.port';

export type SourceCredentialRefreshResult = {
  readonly refreshed: boolean;
  readonly secret: SourceCredentialSecret;
  readonly expiresAt?: Date;
  readonly scopes?: readonly string[];
};

export interface SourceCredentialRefreshPort {
  refreshIfNeeded(params: {
    readonly credential: SourceCredential;
    readonly secret: SourceCredentialSecret;
    readonly now: Date;
  }): Promise<SourceCredentialRefreshResult>;
}
