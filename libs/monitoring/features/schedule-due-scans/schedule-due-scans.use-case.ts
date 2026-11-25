import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import type {
  ScanJobRepositoryPort,
  ScanDispatchPort,
  ScanJobHistoryReadPort,
  ScanPolicyRepositoryPort,
  ScanSchedulerDecisionHistoryPort,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { ScheduleDueScansCommand } from './schedule-due-scans.command';
import type {
  ScheduleDueScansDecision,
  ScheduleDueScansResult,
} from './schedule-due-scans.result';
import {
  emptySkipBreakdown,
  schedulerDecisionRecordFromDecision,
  totalSkipped,
  type RecordedScheduleDueScansDecision,
} from './schedule-due-scans-decision-support';
import { evaluateDueScanPolicy } from './evaluate-due-scan-policy';

type ScheduleDueScansFailure = DomainError | Error;
type ScanJobRecentHistoryReadPort = Pick<
  ScanJobHistoryReadPort,
  'listBySourceBinding'
>;

export class ScheduleDueScansUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: Omit<ScanJobRepositoryPort, 'save'> &
      ScanJobRecentHistoryReadPort,
    private readonly scanQueue: Pick<ScanQueuePort, 'canAccept'>,
    private readonly scanDispatch: ScanDispatchPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly schedulerDecisions?: ScanSchedulerDecisionHistoryPort,
  ) {}

  async execute(
    command: ScheduleDueScansCommand,
  ): Promise<Result<ScheduleDueScansResult, ScheduleDueScansFailure>> {
    if (
      !Number.isInteger(command.limit) ||
      command.limit < 1 ||
      command.limit > 100
    ) {
      return err(
        new DomainError(
          'validation.failed',
          'Schedule due scans limit must be between 1 and 100',
        ),
      );
    }

    const now = this.clock.now();
    const policies = await this.scanPolicies.findDue({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      now,
      limit: command.limit,
    });
    let enqueued = 0;
    const skippedByReason = emptySkipBreakdown();
    const decisions =
      command.includeDecisions === true
        ? ([] as ScheduleDueScansDecision[])
        : undefined;
    const recordedDecisions: RecordedScheduleDueScansDecision[] = [];

    for (const policy of policies) {
      enqueued += await evaluateDueScanPolicy({
        policy,
        command,
        now,
        ports: {
          sourceBindings: this.sourceBindings,
          scanPolicies: this.scanPolicies,
          scanJobs: this.scanJobs,
          scanQueue: this.scanQueue,
          scanDispatch: this.scanDispatch,
          ids: this.ids,
        },
        skippedByReason,
        decisions,
        recordedDecisions,
      });
    }

    await this.recordSchedulerDecisions({
      decisions: recordedDecisions,
      evaluatedAt: now,
      correlationId: command.correlationId,
    });

    return ok({
      scannedAt: now,
      evaluated: policies.length,
      enqueued,
      skipped: totalSkipped(skippedByReason),
      skippedByReason,
      ...(decisions === undefined ? {} : { decisions }),
    });
  }

  private async recordSchedulerDecisions(params: {
    readonly decisions: readonly RecordedScheduleDueScansDecision[];
    readonly evaluatedAt: Date;
    readonly correlationId: string;
  }): Promise<void> {
    if (
      this.schedulerDecisions === undefined ||
      params.decisions.length === 0
    ) {
      return;
    }

    await this.schedulerDecisions.recordBatch({
      records: params.decisions.map((decision) =>
        schedulerDecisionRecordFromDecision({
          id: this.ids.generate(),
          decision,
          evaluatedAt: params.evaluatedAt,
          correlationId: params.correlationId,
        }),
      ),
    });
  }
}
