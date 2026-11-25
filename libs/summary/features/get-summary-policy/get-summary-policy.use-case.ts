import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { SummaryPolicy } from '../../domain';
import type { SummaryPolicyRepositoryPort } from '../../ports';
import type { GetSummaryPolicyQuery } from './get-summary-policy.query';
import type { GetSummaryPolicyResult } from './get-summary-policy.result';
import { presentSummaryPolicy } from '../shared/summary-policy-presenter';

type GetSummaryPolicyFailure = DomainError | Error;

export class GetSummaryPolicyUseCase {
  constructor(
    private readonly summaryPolicies: SummaryPolicyRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetSummaryPolicyQuery): Promise<Result<GetSummaryPolicyResult, GetSummaryPolicyFailure>> {
    if (query.interestId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Summary policy interest id must be non-empty'));
    }

    const stored = await this.summaryPolicies.findByInterest(query);
    if (stored !== null) {
      return ok({
        policy: presentSummaryPolicy(stored),
        source: 'stored',
      });
    }

    return ok({
      policy: presentSummaryPolicy(SummaryPolicy.defaultForInterest({
        id: this.ids.generate(),
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        interestId: query.interestId,
        now: this.clock.now(),
      })),
      source: 'default',
    });
  }
}
