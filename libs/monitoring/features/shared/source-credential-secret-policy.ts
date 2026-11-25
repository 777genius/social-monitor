import {
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import type { SourceCredentialKind } from '../../domain';
import type { SourceCredentialSecret } from '../../ports';

const redditProviderKey = 'reddit';
const oauth2Kind: SourceCredentialKind = 'oauth2';
const redditTokenUrl = 'https://www.reddit.com/api/v1/access_token';

export type SourceCredentialSecretPolicyInput = {
  readonly providerKey: string;
  readonly kind: SourceCredentialKind;
  readonly secret: SourceCredentialSecret;
};

export const normalizeSourceCredentialSecretForStorage = (
  input: SourceCredentialSecretPolicyInput,
): Result<SourceCredentialSecret, DomainError> => {
  const providerKey = input.providerKey.trim().toLowerCase();
  if (providerKey !== redditProviderKey || input.kind !== oauth2Kind) {
    return ok(input.secret);
  }

  const missingField = ['refreshToken', 'clientId'].find((field) => readString(input.secret[field]) === undefined);
  if (missingField !== undefined) {
    return err(new DomainError(
      'validation.failed',
      `Reddit OAuth source credential must include ${missingField} for recurring scans`,
    ));
  }

  return ok({
    ...input.secret,
    tokenUrl: readString(input.secret.tokenUrl) ?? redditTokenUrl,
  });
};

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
