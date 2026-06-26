import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { SourceBindingStatus } from '../../domain';
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

    const providerKeys = normalizeProviderKeys(query.providerKeys);
    if (providerKeys instanceof DomainError) {
      return err(providerKeys);
    }

    const statuses = normalizeStatuses(query.statuses);
    if (statuses instanceof DomainError) {
      return err(statuses);
    }

    const topic = await this.topics.findById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      topicId: query.topicId,
    });
    if (topic === null) {
      return err(new DomainError('resource.not_found', 'Topic not found', { topicId: query.topicId }));
    }

    const result = await this.sourceBindings.listByTopic({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      topicId: query.topicId,
      limit: query.limit,
      cursor: query.cursor,
      ...(providerKeys === undefined ? {} : { providerKeys }),
      ...(statuses === undefined ? {} : { statuses }),
    });

    return ok({
      sourceBindings: result.sourceBindings.map(presentSourceBinding),
      nextCursor: result.nextCursor,
    });
  }
}

const sourceBindingStatuses = new Set<SourceBindingStatus>(['enabled', 'paused']);

const normalizeProviderKeys = (
  providerKeys: readonly string[] | undefined,
): readonly string[] | undefined | DomainError => {
  if (providerKeys === undefined) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(providerKeys.map((providerKey) => providerKey.trim()).filter(Boolean)),
  ).sort();

  if (providerKeys.length > 0 && normalized.length === 0) {
    return new DomainError('validation.failed', 'Source binding providerKey filter must not be empty');
  }

  return normalized.length === 0 ? undefined : normalized;
};

const normalizeStatuses = (
  statuses: readonly string[] | undefined,
): readonly SourceBindingStatus[] | undefined | DomainError => {
  if (statuses === undefined) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(statuses.map((status) => status.trim()).filter(Boolean)),
  ).sort();

  if (statuses.length > 0 && normalized.length === 0) {
    return new DomainError('validation.failed', 'Source binding status filter must not be empty');
  }

  const invalidStatus = normalized.find((status) => !sourceBindingStatuses.has(status as SourceBindingStatus));
  if (invalidStatus !== undefined) {
    return new DomainError('validation.failed', 'Unsupported source binding status filter', {
      status: invalidStatus,
    });
  }

  return normalized.length === 0 ? undefined : (normalized as SourceBindingStatus[]);
};
