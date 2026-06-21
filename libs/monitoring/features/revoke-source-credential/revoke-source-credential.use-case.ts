import {
  type Clock,
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import type {
  SourceCredentialRepositoryPort,
  SourceCredentialVaultPort,
} from '../../ports';
import { presentSourceCredential } from '../shared/source-credential-presenter';
import type { RevokeSourceCredentialCommand } from './revoke-source-credential.command';
import type { RevokeSourceCredentialResult } from './revoke-source-credential.result';

type RevokeSourceCredentialFailure = DomainError | Error;

export class RevokeSourceCredentialUseCase {
  constructor(
    private readonly credentials: SourceCredentialRepositoryPort,
    private readonly vault: SourceCredentialVaultPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RevokeSourceCredentialCommand,
  ): Promise<Result<RevokeSourceCredentialResult, RevokeSourceCredentialFailure>> {
    const existing = await this.credentials.findById(command);
    if (existing === null) {
      return err(new DomainError('resource.not_found', 'Source credential not found', {
        sourceCredentialId: command.sourceCredentialId,
      }));
    }

    const snapshot = existing.toSnapshot();
    const revoked = existing.revoke({ now: this.clock.now() });

    await this.credentials.save(revoked);
    await this.vault.delete({ secretKeyId: snapshot.secretKeyId });

    return ok({ sourceCredential: presentSourceCredential(revoked) });
  }
}
