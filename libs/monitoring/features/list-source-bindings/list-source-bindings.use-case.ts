import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { SourceBindingRepositoryPort, TopicRepositoryPort } from '../../ports';
import { presentSourceBinding } from '../shared/source-binding-presenter';
import type { ListSourceBindingsQuery } from './list-source-bindings.query';
import type { ListSourceBindingsResult } from './list-source-bindings.result';

type ListSourceBindingsFailure = DomainError;

export class ListSourceBindingsUseCase {
  constructor(
    private readonly topics: TopicRepositoryPort,
    private readonly sourceBindings: SourceBindingRepositoryPort,
  ) {}

  async execute(
    query: ListSourceBindingsQuery,
  ): Promise<Result<ListSourceBindingsResult, ListSourceBindingsFailure>> {
    if (query.topicId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Topic id is required'));
    }

    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      return err(new DomainError('validation.failed', 'Source binding list limit must be between 1 and 100'));
    }

    const topic = await this.topics.findById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      topicId: query.topicId,
    });
    if (topic === null) {
      return err(new DomainError('resource.not_found', 'Topic not found', { topicId: query.topicId }));
    }

    const result = await this.sourceBindings.listByTopic(query);

    return ok({
      sourceBindings: result.sourceBindings.map(presentSourceBinding),
      nextCursor: result.nextCursor,
    });
  }
}
