import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { FailedScanCommand, ScanFailureInspectionPort } from '../../ports';
import { ListScanDeadLettersUseCase } from './list-scan-dead-letters.use-case';

class FakeFailureInspection implements ScanFailureInspectionPort {
  constructor(private readonly commands: readonly FailedScanCommand[]) {}

  async listDeadLetters(
    params: Parameters<ScanFailureInspectionPort['listDeadLetters']>[0],
  ): Promise<readonly FailedScanCommand[]> {
    return this.commands
      .filter((command) => command.tenantId === params.tenantId && command.workspaceId === params.workspaceId)
      .slice(0, params.limit);
  }
}

const makeCommand = (
  scanJobId: string,
  failureReason: string,
  scope = {
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
  },
): FailedScanCommand => ({
  tenantId: scope.tenantId,
  workspaceId: scope.workspaceId,
  scanJobId,
  interestId: `topic-${scanJobId}`,
  sourceBindingId: `source-binding-${scanJobId}`,
  scanPolicyId: `scan-policy-${scanJobId}`,
  providerKey: 'fake-source',
  sourceQuery: {
    mode: 'search',
    query: `dead letter ${scanJobId}`,
  },
  correlationId: `correlation-${scanJobId}`,
  causationId: `causation-${scanJobId}`,
  attemptNumber: 3,
  retryBudget: 3,
  failureReason,
});

describe('ListScanDeadLettersUseCase', () => {
  it('returns tenant-scoped support-safe dead letter entries', async () => {
    const useCase = new ListScanDeadLettersUseCase(new FakeFailureInspection([
      makeCommand('scan-1', 'Provider unavailable: upstream outage'),
      makeCommand('scan-2', '429 provider rate limit'),
      makeCommand('scan-other-tenant', 'Provider unavailable', {
        tenantId: tenantId('tenant-2'),
        workspaceId: workspaceId('workspace-1'),
      }),
    ]));

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        deadLetters: [
          expect.objectContaining({
            scanJobId: 'scan-1',
            failureClass: 'provider_unavailable',
            correlationId: 'correlation-scan-1',
          }),
          expect.objectContaining({
            scanJobId: 'scan-2',
            failureClass: 'provider_rate_limited',
            correlationId: 'correlation-scan-2',
          }),
        ],
      },
    });
    expect(result.ok && JSON.stringify(result.value)).not.toContain('upstream outage');
  });

  it('enforces bounded inspection limits', async () => {
    const useCase = new ListScanDeadLettersUseCase(new FakeFailureInspection([]));

    await expect(useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 101,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});
