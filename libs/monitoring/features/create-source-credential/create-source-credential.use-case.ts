import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { SourceCredential } from '../../domain';
import type {
  SourceCredentialRepositoryPort,
  SourceCredentialVaultPort,
} from '../../ports';
import type { CreateSourceCredentialCommand } from './create-source-credential.command';
import type { CreateSourceCredentialResult } from './create-source-credential.result';
import { presentSourceCredential } from '../shared/source-credential-presenter';
import { previewFromSourceCredentialSecret } from '../shared/source-credential-preview-policy';
import { normalizeSourceCredentialSecretForStorage } from '../shared/source-credential-secret-policy';

type CreateSourceCredentialFailure = DomainError | Error;

export class CreateSourceCredentialUseCase {
  constructor(
    private readonly credentials: SourceCredentialRepositoryPort,
    private readonly vault: SourceCredentialVaultPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: CreateSourceCredentialCommand,
  ): Promise<Result<CreateSourceCredentialResult, CreateSourceCredentialFailure>> {
    const providerKey = command.providerKey.trim();
    if (providerKey.length === 0) {
      return err(new DomainError('validation.failed', 'Source credential provider key must be non-empty'));
    }

    const normalized = normalizeSourceCredentialSecretForStorage({
      providerKey,
      kind: command.kind,
      secret: command.secret,
    });
    if (!normalized.ok) {
      return err(normalized.error);
    }

    const secret = normalized.value;
    if (Object.keys(secret).length === 0) {
      return err(new DomainError('validation.failed', 'Source credential secret must be non-empty'));
    }

    const now = this.clock.now();
    const id = this.ids.generate();
    const secretKeyId = `source_cred_${id}_${this.ids.generate()}`;
    const credential = SourceCredential.create({
      id,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      providerKey,
      kind: command.kind,
      secretKeyId,
      secretPreview: previewFromSourceCredentialSecret(
        command.secretPreview,
        secret,
      ),
      scopes: command.scopes ?? [],
      expiresAt: command.expiresAt,
      createdAt: now,
    });

    await this.vault.put({
      secretKeyId,
      secret,
    });
    await this.credentials.save(credential);

    return ok({ sourceCredential: presentSourceCredential(credential) });
  }
}
