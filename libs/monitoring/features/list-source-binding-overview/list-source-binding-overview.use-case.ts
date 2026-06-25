import { err, ok, type DomainError, type Result } from '@social-monitor/shared-kernel';

import type { GetSourceBindingHealthUseCase } from '../get-source-binding-health/get-source-binding-health.use-case';
import type { ListSourceBindingsUseCase } from '../list-source-bindings/list-source-bindings.use-case';
import type { ListSourceBindingOverviewQuery } from './list-source-binding-overview.query';
import type { ListSourceBindingOverviewResult } from './list-source-binding-overview.result';

type ListSourceBindingOverviewFailure = DomainError;
type ListSourceBindingsExecutor = Pick<ListSourceBindingsUseCase, 'execute'>;
type GetSourceBindingHealthExecutor = Pick<GetSourceBindingHealthUseCase, 'execute'>;

export class ListSourceBindingOverviewUseCase {
  constructor(
    private readonly listSourceBindings: ListSourceBindingsExecutor,
    private readonly getSourceBindingHealth: GetSourceBindingHealthExecutor,
  ) {}

  async execute(
    query: ListSourceBindingOverviewQuery,
  ): Promise<Result<ListSourceBindingOverviewResult, ListSourceBindingOverviewFailure>> {
    const listed = await this.listSourceBindings.execute(query);

    if (!listed.ok) {
      return err(listed.error);
    }

    const healthResults = await Promise.all(
      listed.value.sourceBindings.map((sourceBinding) =>
        this.getSourceBindingHealth.execute({
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          topicId: query.topicId,
          sourceBindingId: sourceBinding.id,
        }),
      ),
    );
    const failed = healthResults.find((result) => !result.ok);

    if (failed !== undefined && !failed.ok) {
      return err(failed.error);
    }

    return ok({
      items: healthResults.map((result) => {
        if (!result.ok) {
          throw result.error;
        }

        return result.value;
      }),
      nextCursor: listed.value.nextCursor,
    });
  }
}
