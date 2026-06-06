import type { ApiKeyView } from '../shared/api-key-presenter';

export type CreateApiKeyResult = {
  readonly apiKey: ApiKeyView;
  readonly secret: string;
};
