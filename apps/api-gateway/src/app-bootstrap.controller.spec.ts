import { DomainError, err, ok } from '@social-monitor/shared-kernel';
import type { GetAuthSessionUseCase } from '@social-monitor/identity/features/get-auth-session/get-auth-session.use-case';
import type { ListReaderSummaryPeriodsUseCase } from '@social-monitor/summary/features/list-reader-summary-periods/list-reader-summary-periods.use-case';
import type { ListReaderSummariesUseCase } from '@social-monitor/summary/features/list-reader-summaries/list-reader-summaries.use-case';

import { AppBootstrapController } from './app-bootstrap.controller';

const session = {
  userId: 'user-1',
  userLabel: 'User 1',
  userRole: 'user' as const,
  selectedWorkspace: {
    tenantId: 'tenant-1',
    workspaceId: 'workspace-1',
    tenantName: 'Tenant 1',
    workspaceName: 'Workspace 1',
    workspaceRole: 'viewer' as const,
    statusLabel: 'Active',
  },
  workspaces: [],
};

describe('AppBootstrapController', () => {
  it('loads latest summary and period links concurrently after session verification', async () => {
    let resolveLatest!: (value: ReturnType<typeof ok>) => void;
    let resolvePeriods!: (value: ReturnType<typeof ok>) => void;
    const latestResult = new Promise<ReturnType<typeof ok>>((resolve) => {
      resolveLatest = resolve;
    });
    const periodsResult = new Promise<ReturnType<typeof ok>>((resolve) => {
      resolvePeriods = resolve;
    });
    const getAuthSession = {
      execute: jest.fn().mockResolvedValue(ok(session)),
    };
    const listReaderSummaries = {
      execute: jest.fn().mockReturnValue(latestResult),
    };
    const listReaderSummaryPeriods = {
      execute: jest.fn().mockReturnValue(periodsResult),
    };
    const controller = new AppBootstrapController(
      getAuthSession as unknown as GetAuthSessionUseCase,
      listReaderSummaries as unknown as ListReaderSummariesUseCase,
      listReaderSummaryPeriods as unknown as ListReaderSummaryPeriodsUseCase,
    );

    const response = controller.get('Bearer session-token');
    await Promise.resolve();

    expect(getAuthSession.execute).toHaveBeenCalledWith({
      accessToken: 'session-token',
    });
    expect(listReaderSummaries.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
      scope: { type: 'workspace' },
      cadence: 'daily',
      timezone: 'UTC',
      limit: 1,
    });
    expect(listReaderSummaryPeriods.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
      scope: { type: 'workspace' },
      cadence: 'daily',
      timezone: 'UTC',
      limit: 40,
    });

    resolveLatest(ok({ items: [] }));
    resolvePeriods(ok({ items: [] }));
    await expect(response).resolves.toEqual({
      session,
      readerSummaries: {
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        latest: { items: [], nextCursor: undefined },
        periods: { items: [], nextCursor: undefined },
      },
    });
  });

  it('does not read summaries when session verification fails', async () => {
    const denied = new DomainError(
      'authorization.denied',
      'Bearer JWT user session is required',
    );
    const getAuthSession = {
      execute: jest.fn().mockResolvedValue(err(denied)),
    };
    const listReaderSummaries = { execute: jest.fn() };
    const listReaderSummaryPeriods = { execute: jest.fn() };
    const controller = new AppBootstrapController(
      getAuthSession as unknown as GetAuthSessionUseCase,
      listReaderSummaries as unknown as ListReaderSummariesUseCase,
      listReaderSummaryPeriods as unknown as ListReaderSummaryPeriodsUseCase,
    );

    await expect(controller.get('Bearer denied-token')).rejects.toBe(denied);
    expect(listReaderSummaries.execute).not.toHaveBeenCalled();
    expect(listReaderSummaryPeriods.execute).not.toHaveBeenCalled();
  });
});
