import { ok } from '@social-monitor/shared-kernel';
import type { ReserveUsageQuotaUseCase } from '@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case';

import type {
  ReserveManualScanRequestQuotaCommand,
  ReserveManualScanRequestQuotaResult,
  ScanRequestQuotaPort,
} from '../../ports';

export class UsageScanRequestQuotaAdapter implements ScanRequestQuotaPort {
  constructor(private readonly reserveUsageQuota: ReserveUsageQuotaUseCase) {}

  async reserveManualScanRequest(
    command: ReserveManualScanRequestQuotaCommand,
  ): ReturnType<ScanRequestQuotaPort['reserveManualScanRequest']> {
    const result = await this.reserveUsageQuota.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      subjectKey: `workspace:${command.tenantId}:${command.workspaceId}`,
      operation: 'scan_request.manual',
      amount: 1,
      limit: manualScanRequestQuotaPerHour(),
      windowSeconds: 3600,
    });

    if (!result.ok) {
      return result;
    }

    return ok({
      remaining: result.value.remaining,
      resetAt: result.value.resetAt,
    } satisfies ReserveManualScanRequestQuotaResult);
  }
}

const manualScanRequestQuotaPerHour = (): number => {
  const configured = Number(process.env.MANUAL_SCAN_REQUEST_QUOTA_PER_HOUR);

  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return 60;
};
