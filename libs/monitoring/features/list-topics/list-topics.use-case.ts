import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { TopicRepositoryPort } from '../../ports';
import { presentTopic } from '../shared/topic-presenter';
import type { ListTopicsQuery } from './list-topics.query';
import type { ListTopicsResult } from './list-topics.result';

type ListTopicsFailure = DomainError;

export class ListTopicsUseCase {
  constructor(private readonly topics: TopicRepositoryPort) {}

  async execute(query: ListTopicsQuery): Promise<Result<ListTopicsResult, ListTopicsFailure>> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      return err(new DomainError('validation.failed', 'Topic list limit must be between 1 and 100'));
    }

    const result = await this.topics.list(query);

    return ok({
      topics: result.topics.map(presentTopic),
      nextCursor: result.nextCursor,
    });
  }
}
