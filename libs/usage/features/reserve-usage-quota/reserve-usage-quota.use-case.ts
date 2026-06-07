import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { UsageQuotaLedgerPort } from '../../ports';
import type { ReserveUsageQuotaUseCaseCommand } from './reserve-usage-quota.command';
import type { ReserveUsageQuotaUseCaseResult } from './reserve-usage-quota.result';

type ReserveUsageQuotaFailure = DomainError;

export class ReserveUsageQuotaUseCase {
  constructor(
    private readonly ledger: UsageQuotaLedgerPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ReserveUsageQuotaUseCaseCommand,
  ): Promise<Result<ReserveUsageQuotaUseCaseResult, ReserveUsageQuotaFailure>> {
    if (command.subjectKey.trim().length === 0 || command.operation.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Quota subject and operation must be non-empty'));
    }

    if (!Number.isInteger(command.amount) || command.amount < 1 || command.amount > 1_000_000) {
      return err(new DomainError('validation.failed', 'Quota amount must be between 1 and 1000000'));
    }

    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > 1_000_000) {
      return err(new DomainError('validation.failed', 'Quota limit must be between 1 and 1000000'));
    }

    if (!Number.isInteger(command.windowSeconds) || command.windowSeconds < 1 || command.windowSeconds > 2_592_000) {
      return err(new DomainError('validation.failed', 'Quota window must be between 1 and 2592000 seconds'));
    }

    const now = this.clock.now();
    const windowStartedAt = floorToWindow(now, command.windowSeconds);
    const windowEndsAt = new Date(windowStartedAt.getTime() + command.windowSeconds * 1000);
    const reservation = await this.ledger.reserve({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      subjectKey: command.subjectKey,
      operation: command.operation,
      amount: command.amount,
      limit: command.limit,
      windowStartedAt,
      windowEndsAt,
    });

    if (!reservation.allowed) {
      return err(new DomainError('operation.quota_exceeded', 'Usage quota exceeded', {
        operation: command.operation,
        amount: command.amount,
        limit: command.limit,
        consumed: reservation.consumed,
        remaining: reservation.remaining,
        resetAt: windowEndsAt.toISOString(),
        retryAfterSeconds: Math.max(Math.ceil((windowEndsAt.getTime() - now.getTime()) / 1000), 1),
      }));
    }

    return ok({
      allowed: true,
      amount: command.amount,
      limit: command.limit,
      consumed: reservation.consumed,
      remaining: reservation.remaining,
      resetAt: windowEndsAt.toISOString(),
    });
  }
}

const floorToWindow = (date: Date, windowSeconds: number): Date => {
  const windowMilliseconds = windowSeconds * 1000;

  return new Date(Math.floor(date.getTime() / windowMilliseconds) * windowMilliseconds);
};
