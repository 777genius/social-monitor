import { ok, type Result } from '@social-monitor/shared-kernel';

import type { SourceCredentialRepositoryPort } from '../../ports';
import { presentSourceCredential } from '../shared/source-credential-presenter';
import type { ListSourceCredentialsQuery } from './list-source-credentials.query';
import type { ListSourceCredentialsResult } from './list-source-credentials.result';

export class ListSourceCredentialsUseCase {
  constructor(private readonly credentials: SourceCredentialRepositoryPort) {}

  async execute(query: ListSourceCredentialsQuery): Promise<Result<ListSourceCredentialsResult, Error>> {
    const result = await this.credentials.list(query);

    return ok({
      sourceCredentials: result.sourceCredentials.map(presentSourceCredential),
      nextCursor: result.nextCursor,
    });
  }
}
