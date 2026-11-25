import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { InterestRepositoryPort } from '../../ports';
import { presentInterest } from '../shared/interest-presenter';
import type { UpdateInterestCommand } from './update-interest.command';
import type { UpdateInterestResult } from './update-interest.result';

type UpdateInterestFailure = DomainError | Error;

export class UpdateInterestUseCase {
  constructor(private readonly interests: InterestRepositoryPort) {}

  async execute(command: UpdateInterestCommand): Promise<Result<UpdateInterestResult, UpdateInterestFailure>> {
    const validationFailure = validateCommand(command);
    if (validationFailure !== null) {
      return err(validationFailure);
    }

    const interest = await this.interests.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestId: command.interestId,
    });
    if (interest === null) {
      return err(new DomainError('resource.not_found', 'Interest not found', { interestId: command.interestId }));
    }

    const duplicate = await this.interests.findByName({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      name: command.name,
    });
    if (duplicate !== null && duplicate.toSnapshot().id !== command.interestId) {
      return err(new DomainError('operation.conflict', 'Interest name is already used in this workspace', {
        name: command.name.trim(),
      }));
    }

    const updated = interest.updateDetails({
      name: command.name,
      query: command.query,
    });
    await this.interests.save(updated);

    return ok(presentInterest(updated));
  }
}

const validateCommand = (command: UpdateInterestCommand): DomainError | null => {
  if (command.interestId.trim().length === 0) {
    return new DomainError('validation.failed', 'Interest id is required');
  }
  if (command.name.trim().length < 2) {
    return new DomainError('validation.failed', 'Interest name must contain at least 2 characters');
  }
  if (command.query.trim().length < 2) {
    return new DomainError('validation.failed', 'Interest query must contain at least 2 characters');
  }
  return null;
};
