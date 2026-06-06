import type { ApiKeyView } from '../shared/api-key-presenter';

export type ListApiKeysResult = {
  readonly apiKeys: readonly ApiKeyView[];
  readonly nextCursor?: string;
};
