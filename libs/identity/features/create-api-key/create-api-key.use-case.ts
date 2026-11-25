import { type Clock, DomainError, type IdGenerator, err, ok, type Result } from '@social-monitor/shared-kernel';

import { ApiKey } from '../../domain';
import type { ApiKeyHasherPort, ApiKeyRepositoryPort } from '../../ports';
import { presentApiKey } from '../shared/api-key-presenter';
import type { CreateApiKeyCommand } from './create-api-key.command';
import type { CreateApiKeyResult } from './create-api-key.result';

type CreateApiKeyFailure = DomainError | Error;

export class CreateApiKeyUseCase {
  constructor(
    private readonly apiKeys: ApiKeyRepositoryPort,
    private readonly hasher: ApiKeyHasherPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateApiKeyCommand): Promise<Result<CreateApiKeyResult, CreateApiKeyFailure>> {
    if (command.name.trim().length === 0) {
      return err(new DomainError('validation.failed', 'API key name must be non-empty'));
    }

    if (command.scopes.length === 0) {
      return err(new DomainError('validation.failed', 'API key must include at least one scope'));
    }

    const secret = `smk_${this.ids.generate()}_${this.ids.generate()}`;
    const keyPrefix = secret.slice(0, 12);
    const apiKey = ApiKey.create({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      name: command.name,
      keyPrefix,
      secretHash: await this.hasher.hash(secret),
      scopes: command.scopes,
      status: 'active',
      createdAt: this.clock.now(),
    });

    await this.apiKeys.save(apiKey);

    return ok({
      apiKey: presentApiKey(apiKey),
      secret,
    });
  }
}
