import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { FailedScanCommand, ScanFailureInspectionPort } from '../../ports';
import type { ListScanDeadLettersQuery } from './list-scan-dead-letters.query';
import type {
  ListScanDeadLettersResult,
  ScanDeadLetterEntry,
  ScanDeadLetterFailureClass,
} from './list-scan-dead-letters.result';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export class ListScanDeadLettersUseCase {
  constructor(private readonly failures: ScanFailureInspectionPort) {}

  async execute(
    query: ListScanDeadLettersQuery,
  ): Promise<Result<ListScanDeadLettersResult, DomainError>> {
    const limit = normalizeLimit(query.limit);

    if (!limit.ok) {
      return err(limit.error);
    }

    const deadLetters = await this.failures.listDeadLetters({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      limit: limit.value,
    });

    return ok({
      deadLetters: deadLetters.map(toEntry),
    });
  }
}

const normalizeLimit = (limit: number | undefined): Result<number, DomainError> => {
  if (limit === undefined) {
    return ok(DEFAULT_LIMIT);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return err(new DomainError('validation.failed', 'Dead letter limit must be an integer between 1 and 100'));
  }

  return ok(limit);
};

const toEntry = (command: FailedScanCommand): ScanDeadLetterEntry => {
  const failureClass = classifyFailure(command.failureReason);

  return {
    scanJobId: command.scanJobId,
    sourceBindingId: command.sourceBindingId,
    scanPolicyId: command.scanPolicyId,
    attemptNumber: command.attemptNumber,
    retryBudget: command.retryBudget,
    failureClass,
    operatorAction: operatorActionFor(failureClass),
    correlationId: command.correlationId,
    causationId: command.causationId,
  };
};

const classifyFailure = (failureReason: string): ScanDeadLetterFailureClass => {
  const normalized = failureReason.toLowerCase();

  if (normalized.includes('rate limit') || normalized.includes('429')) {
    return 'provider_rate_limited';
  }

  if (normalized.includes('provider') || normalized.includes('unavailable')) {
    return 'provider_unavailable';
  }

  if (normalized.includes('lease') || normalized.includes('already')) {
    return 'worker_conflict';
  }

  return 'system_failure';
};

const operatorActionFor = (failureClass: ScanDeadLetterFailureClass): string => {
  switch (failureClass) {
    case 'provider_rate_limited':
      return 'Pause or slow the source binding, check provider quota, then replay after cooldown.';
    case 'provider_unavailable':
      return 'Check provider health and circuit breaker state, then replay after provider recovery.';
    case 'worker_conflict':
      return 'Check stale leases or duplicate delivery, then replay only after active work is clear.';
    case 'system_failure':
      return 'Inspect correlated logs and scan attempt state, then replay after the root cause is fixed.';
  }
};
