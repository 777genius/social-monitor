import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { ArchiveInterestParams, InterestRepositoryPort } from '../../ports';
import { presentArchivedInterest } from '../shared/interest-presenter';
import type { ArchiveInterestCommand } from './archive-interest.command';
import type { ArchiveInterestResult } from './archive-interest.result';

type ArchiveInterestFailure = DomainError | Error;

export class ArchiveInterestUseCase {
  constructor(
    private readonly interests: InterestRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveInterestCommand): Promise<Result<ArchiveInterestResult, ArchiveInterestFailure>> {
    if (command.interestId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Interest id is required'));
    }

    const interest = await this.interests.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: command.interestId,
    });
    if (interest === null) {
      return err(new DomainError('resource.not_found', 'Interest not found', { interestId: command.interestId }));
    }

    if (typeof this.interests.archive !== 'function') {
      return err(new DomainError('operation.conflict', 'Interest archive is not supported by the repository'));
    }

    await this.interests.archive({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: command.interestId,
      archivedAt: this.clock.now(),
    } satisfies ArchiveInterestParams);

    return ok(presentArchivedInterest(interest));
  }
}
