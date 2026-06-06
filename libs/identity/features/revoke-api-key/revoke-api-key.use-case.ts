import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { ApiKeyRepositoryPort } from '../../ports';
import { presentApiKey } from '../shared/api-key-presenter';
import type { RevokeApiKeyCommand } from './revoke-api-key.command';
import type { RevokeApiKeyResult } from './revoke-api-key.result';

type RevokeApiKeyFailure = DomainError;

export class RevokeApiKeyUseCase {
  constructor(
    private readonly apiKeys: ApiKeyRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(command: RevokeApiKeyCommand): Promise<Result<RevokeApiKeyResult, RevokeApiKeyFailure>> {
    if (command.apiKeyId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'API key id must be non-empty'));
    }

    const apiKey = await this.apiKeys.findById(command);

    if (apiKey === null) {
      return err(new DomainError('resource.not_found', 'API key not found', {
        apiKeyId: command.apiKeyId,
      }));
    }

    const revoked = apiKey.revoke({ revokedAt: this.clock.now() });
    await this.apiKeys.save(revoked);

    return ok(presentApiKey(revoked));
  }
}
