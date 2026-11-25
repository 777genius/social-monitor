import { ok } from '@social-monitor/shared-kernel';
import type { ReserveUsageQuotaUseCase } from '@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case';

import type { ReserveSummaryJobQuotaCommand, ReserveSummaryJobQuotaResult, SummaryQuotaPort } from '../../ports';

export type UsageSummaryQuotaAdapterOptions = {
  readonly quotaPerHour: number;
};

export class UsageSummaryQuotaAdapter implements SummaryQuotaPort {
  constructor(
    private readonly reserveUsageQuota: ReserveUsageQuotaUseCase,
    private readonly options: UsageSummaryQuotaAdapterOptions,
  ) {}

  async reserveSummaryJob(command: ReserveSummaryJobQuotaCommand): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
    const result = await this.reserveUsageQuota.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      subjectKey: `workspace:${command.tenantId}:${command.workspaceId}`,
      operation: command.operation,
      amount: 1,
      limit: this.options.quotaPerHour,
      windowSeconds: 3600,
    });

    if (!result.ok) {
      return result;
    }

    return ok({
      remaining: result.value.remaining,
      resetAt: result.value.resetAt,
    } satisfies ReserveSummaryJobQuotaResult);
  }
}
