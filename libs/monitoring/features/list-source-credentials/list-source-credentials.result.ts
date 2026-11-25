import type { SourceCredentialView } from '../shared/source-credential-presenter';

export type ListSourceCredentialsResult = {
  readonly sourceCredentials: readonly SourceCredentialView[];
  readonly nextCursor?: string;
};
