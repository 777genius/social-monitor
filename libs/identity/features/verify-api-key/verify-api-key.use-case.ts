import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { ApiKeyHasherPort, ApiKeyRepositoryPort } from '../../ports';
import { presentApiKey } from '../shared/api-key-presenter';
import type { VerifyApiKeyCommand } from './verify-api-key.command';
import type { VerifyApiKeyResult } from './verify-api-key.result';

type VerifyApiKeyFailure = DomainError;

export class VerifyApiKeyUseCase {
  constructor(
    private readonly apiKeys: ApiKeyRepositoryPort,
    private readonly hasher: ApiKeyHasherPort,
  ) {}

  async execute(command: VerifyApiKeyCommand): Promise<Result<VerifyApiKeyResult, VerifyApiKeyFailure>> {
    const keyPrefix = command.secret.slice(0, 12);
    const apiKey = await this.apiKeys.findByKeyPrefix({ keyPrefix });

    if (apiKey === null) {
      return err(new DomainError('authorization.denied', 'API key is invalid'));
    }

    const snapshot = apiKey.toSnapshot();
    const validSecret = await this.hasher.verify({
      secret: command.secret,
      hash: snapshot.secretHash,
    });

    if (!validSecret || snapshot.status !== 'active') {
      return err(new DomainError('authorization.denied', 'API key is invalid'));
    }

    if (!snapshot.scopes.includes(command.requiredScope)) {
      return err(new DomainError('authorization.denied', 'API key scope is not allowed', {
        requiredScope: command.requiredScope,
      }));
    }

    return ok({
      apiKey: presentApiKey(apiKey),
    });
  }
}
