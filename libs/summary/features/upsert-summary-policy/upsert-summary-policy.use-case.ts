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
import type { UpsertSummaryPolicyCommand } from './upsert-summary-policy.command';
import type { UpsertSummaryPolicyResult } from './upsert-summary-policy.result';
import { presentSummaryPolicy } from '../shared/summary-policy-presenter';

type UpsertSummaryPolicyFailure = DomainError | Error;

export class UpsertSummaryPolicyUseCase {
  constructor(
    private readonly summaryPolicies: SummaryPolicyRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: UpsertSummaryPolicyCommand): Promise<Result<UpsertSummaryPolicyResult, UpsertSummaryPolicyFailure>> {
    if (command.interestId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Summary policy interest id must be non-empty'));
    }

    try {
      const existing = await this.summaryPolicies.findByInterest(command);
      const now = this.clock.now();
      const policy = existing === null
        ? SummaryPolicy.create({
            id: this.ids.generate(),
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            interestId: command.interestId,
            language: command.language,
            format: command.format,
            tone: command.tone,
            maxKeyPoints: command.maxKeyPoints,
            includeRisks: command.includeRisks,
            includeSourceHighlights: command.includeSourceHighlights,
            customInstructions: command.customInstructions,
            createdAt: now,
            updatedAt: now,
          })
        : existing.update({
            language: command.language,
            format: command.format,
            tone: command.tone,
            maxKeyPoints: command.maxKeyPoints,
            includeRisks: command.includeRisks,
            includeSourceHighlights: command.includeSourceHighlights,
            customInstructions: command.customInstructions,
            updatedAt: now,
          });

      await this.summaryPolicies.save(policy);

      return ok({
        policy: presentSummaryPolicy(policy),
        created: existing === null,
      });
    } catch (error) {
      if (error instanceof Error) {
        return err(new DomainError('validation.failed', error.message));
      }

      return err(new DomainError('validation.failed', 'Summary policy is invalid'));
    }
  }
}
