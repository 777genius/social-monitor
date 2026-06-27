import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { ArchiveTopicParams, TopicRepositoryPort } from '../../ports';
import { presentArchivedTopic } from '../shared/topic-presenter';
import type { ArchiveTopicCommand } from './archive-topic.command';
import type { ArchiveTopicResult } from './archive-topic.result';

type ArchiveTopicFailure = DomainError | Error;

export class ArchiveTopicUseCase {
  constructor(
    private readonly topics: TopicRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveTopicCommand): Promise<Result<ArchiveTopicResult, ArchiveTopicFailure>> {
    if (command.topicId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Topic id is required'));
    }

    const topic = await this.topics.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: command.topicId,
    });
    if (topic === null) {
      return err(new DomainError('resource.not_found', 'Topic not found', { topicId: command.topicId }));
    }

    if (typeof this.topics.archive !== 'function') {
      return err(new DomainError('operation.conflict', 'Topic archive is not supported by the repository'));
    }

    await this.topics.archive({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: command.topicId,
      archivedAt: this.clock.now(),
    } satisfies ArchiveTopicParams);

    return ok(presentArchivedTopic(topic));
  }
}
