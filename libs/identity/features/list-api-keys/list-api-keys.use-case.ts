import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { ApiKeyRepositoryPort } from '../../ports';
import { presentApiKey } from '../shared/api-key-presenter';
import type { ListApiKeysQuery } from './list-api-keys.query';
import type { ListApiKeysResult } from './list-api-keys.result';

type ListApiKeysFailure = DomainError;

export class ListApiKeysUseCase {
  constructor(private readonly apiKeys: ApiKeyRepositoryPort) {}

  async execute(query: ListApiKeysQuery): Promise<Result<ListApiKeysResult, ListApiKeysFailure>> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      return err(new DomainError('validation.failed', 'API key list limit must be between 1 and 100'));
    }

    const result = await this.apiKeys.list(query);

    return ok({
      apiKeys: result.apiKeys.map(presentApiKey),
      nextCursor: result.nextCursor,
    });
  }
}
