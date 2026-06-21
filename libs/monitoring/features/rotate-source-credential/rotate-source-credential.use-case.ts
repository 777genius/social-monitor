import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import type {
  SourceCredentialRepositoryPort,
  SourceCredentialVaultPort,
} from '../../ports';
import { previewFromSecret } from '../create-source-credential/create-source-credential.use-case';
import { presentSourceCredential } from '../shared/source-credential-presenter';
import { normalizeSourceCredentialSecretForStorage } from '../shared/source-credential-secret-policy';
import type { RotateSourceCredentialCommand } from './rotate-source-credential.command';
import type { RotateSourceCredentialResult } from './rotate-source-credential.result';

type RotateSourceCredentialFailure = DomainError | Error;

export class RotateSourceCredentialUseCase {
  constructor(
    private readonly credentials: SourceCredentialRepositoryPort,
    private readonly vault: SourceCredentialVaultPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RotateSourceCredentialCommand,
  ): Promise<Result<RotateSourceCredentialResult, RotateSourceCredentialFailure>> {
    const existing = await this.credentials.findById(command);
    if (existing === null) {
      return err(new DomainError('resource.not_found', 'Source credential not found', {
        sourceCredentialId: command.sourceCredentialId,
      }));
    }

    const snapshot = existing.toSnapshot();
    const normalized = normalizeSourceCredentialSecretForStorage({
      providerKey: snapshot.providerKey,
      kind: snapshot.kind,
      secret: command.secret,
    });
    if (!normalized.ok) {
      return err(normalized.error);
    }

    const secret = normalized.value;
    if (Object.keys(secret).length === 0) {
      return err(new DomainError('validation.failed', 'Source credential secret must be non-empty'));
    }

    const secretKeyId = `source_cred_${snapshot.id}_${this.ids.generate()}`;
    const rotated = existing.rotate({
      secretKeyId,
      secretPreview: previewFromSecret(command.secretPreview, secret),
      scopes: command.scopes ?? snapshot.scopes,
      expiresAt: command.expiresAt,
      now: this.clock.now(),
    });

    await this.vault.put({ secretKeyId, secret });
    await this.credentials.save(rotated);
    await this.vault.delete({ secretKeyId: snapshot.secretKeyId });

    return ok({ sourceCredential: presentSourceCredential(rotated) });
  }
}
