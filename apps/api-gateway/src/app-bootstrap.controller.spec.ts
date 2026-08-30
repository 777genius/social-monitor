import { DomainError, FixedClock, err, ok } from '@social-monitor/shared-kernel';
import type { GetAuthSessionUseCase } from '@social-monitor/identity/features/get-auth-session/get-auth-session.use-case';
import type { ListReaderSummaryPeriodsUseCase } from '@social-monitor/summary/features/list-reader-summary-periods/list-reader-summary-periods.use-case';
import type { ListReaderSummariesUseCase } from '@social-monitor/summary/features/list-reader-summaries/list-reader-summaries.use-case';

import { AppBootstrapController } from './app-bootstrap.controller';
import { AppBootstrapReaderSummaryCache } from './app-bootstrap-reader-summary-cache';

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
  const createCache = () =>
    new AppBootstrapReaderSummaryCache(
      new FixedClock(new Date('2026-08-29T00:00:00.000Z')),
      30_000,
      300_000,
      10,
    );

  it('marks the session-bearing response private and uncacheable', () => {
    const headers = Reflect.getMetadata(
      '__headers__',
      AppBootstrapController.prototype.get,
    ) as readonly { readonly name: string; readonly value: string }[];

    expect(headers).toEqual(
      expect.arrayContaining([
        { name: 'Cache-Control', value: 'private, no-store' },
        { name: 'Pragma', value: 'no-cache' },
        { name: 'Vary', value: 'Authorization, Cookie' },
      ]),
    );
  });

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
      createCache(),
    );

    const response = controller.get('Bearer token-value');
    await Promise.resolve();
    await Promise.resolve();

    expect(getAuthSession.execute).toHaveBeenCalledWith({
      accessToken: 'token-value',
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
      createCache(),
    );

    await expect(controller.get('Bearer token-value')).rejects.toBe(denied);
    expect(listReaderSummaries.execute).not.toHaveBeenCalled();
    expect(listReaderSummaryPeriods.execute).not.toHaveBeenCalled();
  });

  it('verifies every session while reusing only published summary data', async () => {
    const getAuthSession = {
      execute: jest
        .fn()
        .mockResolvedValueOnce(ok(session))
        .mockResolvedValueOnce(ok({ ...session, userLabel: 'Changed user' })),
    };
    const listReaderSummaries = {
      execute: jest.fn().mockResolvedValue(ok({ items: [] })),
    };
    const listReaderSummaryPeriods = {
      execute: jest.fn().mockResolvedValue(ok({ items: [] })),
    };
    const controller = new AppBootstrapController(
      getAuthSession as unknown as GetAuthSessionUseCase,
      listReaderSummaries as unknown as ListReaderSummariesUseCase,
      listReaderSummaryPeriods as unknown as ListReaderSummaryPeriodsUseCase,
      createCache(),
    );

    const first = await controller.get('Bearer token-value');
    const second = await controller.get('Bearer token-value');

    expect(first.session.userLabel).toBe('User 1');
    expect(second.session.userLabel).toBe('Changed user');
    expect(getAuthSession.execute).toHaveBeenCalledTimes(2);
    expect(listReaderSummaries.execute).toHaveBeenCalledTimes(1);
    expect(listReaderSummaryPeriods.execute).toHaveBeenCalledTimes(1);
  });

  it('does not let a populated summary cache bypass later authentication', async () => {
    const denied = new DomainError(
      'authorization.denied',
      'Bearer JWT user session is required',
    );
    const getAuthSession = {
      execute: jest
        .fn()
        .mockResolvedValueOnce(ok(session))
        .mockResolvedValueOnce(err(denied)),
    };
    const listReaderSummaries = {
      execute: jest.fn().mockResolvedValue(ok({ items: [] })),
    };
    const listReaderSummaryPeriods = {
      execute: jest.fn().mockResolvedValue(ok({ items: [] })),
    };
    const controller = new AppBootstrapController(
      getAuthSession as unknown as GetAuthSessionUseCase,
      listReaderSummaries as unknown as ListReaderSummariesUseCase,
      listReaderSummaryPeriods as unknown as ListReaderSummaryPeriodsUseCase,
      createCache(),
    );

    await expect(controller.get('Bearer token-value')).resolves.toBeDefined();
    await expect(controller.get('Bearer token-value')).rejects.toBe(denied);

    expect(getAuthSession.execute).toHaveBeenNthCalledWith(1, {
      accessToken: 'token-value',
    });
    expect(getAuthSession.execute).toHaveBeenNthCalledWith(2, {
      accessToken: 'token-value',
    });
    expect(listReaderSummaries.execute).toHaveBeenCalledTimes(1);
    expect(listReaderSummaryPeriods.execute).toHaveBeenCalledTimes(1);
  });
});
