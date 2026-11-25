import type { ApiKeyScope } from '../../domain';

export type VerifyApiKeyCommand = {
  readonly secret: string;
  readonly requiredScope: ApiKeyScope;
};
