import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  ReserveUsageQuotaCommand,
  ReserveUsageQuotaResult,
  UsageQuotaLedgerPort,
} from '../../ports';
import { ReserveUsageQuotaUseCase } from './reserve-usage-quota.use-case';

class FakeUsageQuotaLedger implements UsageQuotaLedgerPort {
  private readonly consumedByBucket = new Map<string, number>();

  async reserve(command: ReserveUsageQuotaCommand): Promise<ReserveUsageQuotaResult> {
    const key = [
      command.tenantId,
      command.workspaceId,
      command.subjectKey,
      command.operation,
      command.windowStartedAt.toISOString(),
    ].join(':');
    const current = this.consumedByBucket.get(key) ?? 0;
    const next = current + command.amount;

    if (next > command.limit) {
      return {
        allowed: false,
        consumed: current,
        remaining: Math.max(command.limit - current, 0),
      };
    }

    this.consumedByBucket.set(key, next);

    return {
      allowed: true,
      consumed: next,
      remaining: Math.max(command.limit - next, 0),
    };
  }
}

describe('ReserveUsageQuotaUseCase', () => {
  it('reserves usage before work and rejects overflow without consuming more quota', async () => {
    const useCase = new ReserveUsageQuotaUseCase(
      new FakeUsageQuotaLedger(),
      new FixedClock(new Date('2026-06-06T12:15:05.000Z')),
    );
    const command = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      subjectKey: 'workspace:tenant-1:workspace-1',
      operation: 'scan_request.manual',
      amount: 1,
      limit: 2,
      windowSeconds: 3600,
    };

    await expect(useCase.execute(command)).resolves.toEqual({
      ok: true,
      value: {
        allowed: true,
        amount: 1,
        limit: 2,
        consumed: 1,
        remaining: 1,
        resetAt: '2026-06-06T13:00:00.000Z',
      },
    });
    await expect(useCase.execute(command)).resolves.toEqual({
      ok: true,
      value: {
        allowed: true,
        amount: 1,
        limit: 2,
        consumed: 2,
        remaining: 0,
        resetAt: '2026-06-06T13:00:00.000Z',
      },
    });
    await expect(useCase.execute(command)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.quota_exceeded',
        details: expect.objectContaining({
          consumed: 2,
          remaining: 0,
          retryAfterSeconds: 2695,
        }),
      }),
    });
  });

  it('keeps tenants, workspaces and operations in separate quota buckets', async () => {
    const useCase = new ReserveUsageQuotaUseCase(
      new FakeUsageQuotaLedger(),
      new FixedClock(new Date('2026-06-06T12:15:05.000Z')),
    );

    await expect(useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      subjectKey: 'workspace:tenant-1:workspace-1',
      operation: 'scan_request.manual',
      amount: 1,
      limit: 1,
      windowSeconds: 3600,
    })).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-2'),
      subjectKey: 'workspace:tenant-1:workspace-2',
      operation: 'scan_request.manual',
      amount: 1,
      limit: 1,
      windowSeconds: 3600,
    })).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      subjectKey: 'workspace:tenant-1:workspace-1',
      operation: 'summary.generate',
      amount: 1,
      limit: 1,
      windowSeconds: 3600,
    })).resolves.toEqual(expect.objectContaining({ ok: true }));
  });
});
