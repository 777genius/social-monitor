import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { TopicRepositoryPort } from '../../ports';
import { presentTopic } from '../shared/topic-presenter';
import type { UpdateTopicCommand } from './update-topic.command';
import type { UpdateTopicResult } from './update-topic.result';

type UpdateTopicFailure = DomainError | Error;

export class UpdateTopicUseCase {
  constructor(private readonly topics: TopicRepositoryPort) {}

  async execute(command: UpdateTopicCommand): Promise<Result<UpdateTopicResult, UpdateTopicFailure>> {
    const validationFailure = validateCommand(command);
    if (validationFailure !== null) {
      return err(validationFailure);
    }

    const topic = await this.topics.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: command.topicId,
    });
    if (topic === null) {
      return err(new DomainError('resource.not_found', 'Topic not found', { topicId: command.topicId }));
    }

    const duplicate = await this.topics.findByName({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      name: command.name,
    });
    if (duplicate !== null && duplicate.toSnapshot().id !== command.topicId) {
      return err(new DomainError('operation.conflict', 'Topic name is already used in this workspace', {
        name: command.name.trim(),
      }));
    }

    const updated = topic.updateDetails({
      name: command.name,
      query: command.query,
    });
    await this.topics.save(updated);

    return ok(presentTopic(updated));
  }
}

const validateCommand = (command: UpdateTopicCommand): DomainError | null => {
  if (command.topicId.trim().length === 0) {
    return new DomainError('validation.failed', 'Topic id is required');
  }
  if (command.name.trim().length < 2) {
    return new DomainError('validation.failed', 'Topic name must contain at least 2 characters');
  }
  if (command.query.trim().length < 2) {
    return new DomainError('validation.failed', 'Topic query must contain at least 2 characters');
  }
  return null;
};
