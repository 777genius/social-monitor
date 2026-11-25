import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { DigestRepositoryPort } from '../../ports';
import { presentDigest } from '../shared/digest-presenter';
import type { GetDigestQuery } from './get-digest.query';
import type { GetDigestResult } from './get-digest.result';

type GetDigestFailure = DomainError;

export class GetDigestUseCase {
  constructor(private readonly digests: DigestRepositoryPort) {}

  async execute(query: GetDigestQuery): Promise<Result<GetDigestResult, GetDigestFailure>> {
    if (query.digestId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Digest id must be non-empty'));
    }

    const digest = await this.digests.findById(query);

    if (digest === null) {
      return err(new DomainError('resource.not_found', 'Digest not found', {
        digestId: query.digestId,
      }));
    }

    return ok(presentDigest(digest));
  }
}
