import { ok } from '@social-monitor/shared-kernel';
import type { ReserveUsageQuotaUseCase } from '@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case';

import type { ReserveSummaryJobQuotaCommand, ReserveSummaryJobQuotaResult, SummaryQuotaPort } from '../../ports';

export class UsageSummaryQuotaAdapter implements SummaryQuotaPort {
  constructor(private readonly reserveUsageQuota: ReserveUsageQuotaUseCase) {}

  async reserveSummaryJob(command: ReserveSummaryJobQuotaCommand): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
    const result = await this.reserveUsageQuota.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      subjectKey: `workspace:${command.tenantId}:${command.workspaceId}`,
      operation: command.operation,
      amount: 1,
      limit: summaryJobQuotaPerHour(),
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

const summaryJobQuotaPerHour = (): number => {
  const configured = Number(process.env.SUMMARY_JOB_QUOTA_PER_HOUR);

  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return 60;
};
