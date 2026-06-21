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

    if (Object.keys(command.secret).length === 0) {
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
      secretPreview: previewFromSecret(command.secretPreview, command.secret),
      scopes: command.scopes ?? [],
      expiresAt: command.expiresAt,
      createdAt: now,
    });

    await this.vault.put({
      secretKeyId,
      secret: command.secret,
    });
    await this.credentials.save(credential);

    return ok({ sourceCredential: presentSourceCredential(credential) });
  }
}

export const previewFromSecret = (
  configuredPreview: string | undefined,
  secret: Readonly<Record<string, unknown>>,
): string => {
  const trimmed = configuredPreview?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    return trimmed.slice(-16);
  }

  const candidate = firstSecretPreviewCandidate(secret);

  return candidate === undefined ? 'configured' : candidate.slice(-8);
};

const firstSecretPreviewCandidate = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = firstSecretPreviewCandidate(item);
      if (candidate !== undefined) {
        return candidate;
      }
    }
  }

  if (value !== null && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      const candidate = firstSecretPreviewCandidate(nestedValue);
      if (candidate !== undefined) {
        return candidate;
      }
    }
  }

  return undefined;
};
