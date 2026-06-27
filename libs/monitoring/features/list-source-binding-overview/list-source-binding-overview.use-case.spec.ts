import { DomainError, err, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { GetSourceBindingHealthResult } from '../get-source-binding-health/get-source-binding-health.result';
import type { SourceBindingView } from '../shared/source-binding-presenter';
import { ListSourceBindingOverviewUseCase } from './list-source-binding-overview.use-case';

describe('ListSourceBindingOverviewUseCase', () => {
  it('returns health overview for each listed source binding without changing pagination', async () => {
    const tenant = tenantId('tenant-overview');
    const workspace = workspaceId('workspace-overview');
    const listSourceBindings = {
      execute: jest.fn().mockResolvedValue(ok({
        sourceBindings: [
          makeSourceBindingView({ id: 'binding-reddit', providerKey: 'reddit' }),
          makeSourceBindingView({ id: 'binding-github', providerKey: 'github-trending-page' }),
        ],
        nextCursor: 'cursor-next',
      })),
    };
    const getSourceBindingHealth = {
      execute: jest.fn()
        .mockResolvedValueOnce(ok(makeHealthView({
          sourceBinding: makeSourceBindingView({ id: 'binding-reddit', providerKey: 'reddit' }),
          healthState: 'healthy',
        })))
        .mockResolvedValueOnce(ok(makeHealthView({
          sourceBinding: makeSourceBindingView({ id: 'binding-github', providerKey: 'github-trending-page' }),
          healthState: 'scheduled',
        }))),
    };

    const result = await new ListSourceBindingOverviewUseCase(
      listSourceBindings,
      getSourceBindingHealth,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-overview',
      limit: 50,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        summary: expect.objectContaining({
          totalBindings: 2,
          healthyBindings: 1,
          scheduledBindings: 1,
          attentionRequiredBindings: 0,
          operatorAction: 'monitor_sources',
          signals: ['scheduled_later'],
          providerBreakdown: [
            expect.objectContaining({
              providerKey: 'github-trending-page',
              totalBindings: 1,
              scheduledBindings: 1,
            }),
            expect.objectContaining({
              providerKey: 'reddit',
              totalBindings: 1,
              healthyBindings: 1,
            }),
          ],
        }),
        items: [
          expect.objectContaining({
            sourceBinding: expect.objectContaining({ id: 'binding-reddit', providerKey: 'reddit' }),
            healthState: 'healthy',
          }),
          expect.objectContaining({
            sourceBinding: expect.objectContaining({
              id: 'binding-github',
              providerKey: 'github-trending-page',
            }),
            healthState: 'scheduled',
          }),
        ],
        nextCursor: 'cursor-next',
      },
    });
    expect(getSourceBindingHealth.execute).toHaveBeenNthCalledWith(1, {
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-overview',
      sourceBindingId: 'binding-reddit',
    });
    expect(getSourceBindingHealth.execute).toHaveBeenNthCalledWith(2, {
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-overview',
      sourceBindingId: 'binding-github',
    });
  });

  it('summarizes scheduler freshness, rate-limit and provider health signals by provider', async () => {
    const listSourceBindings = {
      execute: jest.fn().mockResolvedValue(ok({
        sourceBindings: [
          makeSourceBindingView({ id: 'binding-ready', providerKey: 'rss' }),
          makeSourceBindingView({ id: 'binding-rate-limited', providerKey: 'reddit' }),
          makeSourceBindingView({ id: 'binding-provider-failure', providerKey: 'reddit' }),
          makeSourceBindingView({ id: 'binding-stale', providerKey: 'reddit' }),
        ],
      })),
    };
    const getSourceBindingHealth = {
      execute: jest.fn()
        .mockResolvedValueOnce(ok(makeHealthView({
          sourceBinding: makeSourceBindingView({ id: 'binding-ready', providerKey: 'rss' }),
          schedulerDecision: {
            canScanNow: true,
            decision: 'ready',
            reason: 'scan_due',
            minimumIntervalSeconds: 300,
            signals: ['scan_due'],
          },
        })))
        .mockResolvedValueOnce(ok(makeHealthView({
          sourceBinding: makeSourceBindingView({ id: 'binding-rate-limited', providerKey: 'reddit' }),
          healthState: 'down',
          operatorAction: 'pause_or_backoff_provider_until_recovery',
          schedulerDecision: {
            canScanNow: false,
            decision: 'rate_limit_backoff',
            reason: 'provider_rate_limited',
            minimumIntervalSeconds: 900,
            rateLimitBackoffUntil: '2026-06-26T00:30:00.000Z',
            nextEligibleAt: '2026-06-26T00:30:00.000Z',
            waitSeconds: 1800,
            signals: ['rate_limit_backoff'],
          },
          recentWindow: {
            providerHealthState: 'down',
            windowStartedAt: '2026-06-25T00:00:00.000Z',
            windowEndedAt: '2026-06-26T00:00:00.000Z',
            totalScans: 2,
            succeededScans: 0,
            failedScans: 2,
            activeScans: 0,
            rateLimitedScans: 2,
            providerUnavailableScans: 1,
            consecutiveFailures: 2,
            operatorAction: 'wait_for_provider_rate_limit_backoff',
            signals: ['rate_limit_backoff', 'provider_unavailable'],
          },
        })))
        .mockResolvedValueOnce(ok(makeHealthView({
          sourceBinding: makeSourceBindingView({ id: 'binding-provider-failure', providerKey: 'reddit' }),
          healthState: 'degraded',
          schedulerDecision: {
            canScanNow: false,
            decision: 'provider_failure_backoff',
            reason: 'provider_failure_backoff_active',
            minimumIntervalSeconds: 900,
            providerFailureBackoffUntil: '2026-06-26T00:25:00.000Z',
            nextEligibleAt: '2026-06-26T00:25:00.000Z',
            waitSeconds: 1500,
            signals: ['provider_failure_backoff'],
          },
          recentWindow: {
            providerHealthState: 'degraded',
            windowStartedAt: '2026-06-25T00:00:00.000Z',
            windowEndedAt: '2026-06-26T00:00:00.000Z',
            totalScans: 2,
            succeededScans: 0,
            failedScans: 2,
            activeScans: 0,
            rateLimitedScans: 0,
            providerUnavailableScans: 2,
            consecutiveFailures: 2,
            operatorAction: 'check_provider_health_or_credentials',
            signals: ['provider_failure_backoff', 'provider_unavailable'],
          },
        })))
        .mockResolvedValueOnce(ok(makeHealthView({
          sourceBinding: makeSourceBindingView({ id: 'binding-stale', providerKey: 'reddit' }),
          healthState: 'stale',
        }))),
    };

    const result = await new ListSourceBindingOverviewUseCase(
      listSourceBindings,
      getSourceBindingHealth,
    ).execute({
      tenantId: tenantId('tenant-overview'),
      workspaceId: workspaceId('workspace-overview'),
      topicId: 'topic-overview',
      limit: 50,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        summary: expect.objectContaining({
          totalBindings: 4,
          canScanNowBindings: 1,
          staleBindings: 1,
          degradedBindings: 1,
          downBindings: 1,
          rateLimitedBindings: 1,
          providerFailureBackoffSkips: 1,
          providerUnavailableScans: 3,
          attentionRequiredBindings: 3,
          nextEligibleAt: '2026-06-26T00:05:00.000Z',
          operatorAction: 'check_provider_health_or_credentials',
          signals: ['provider_failure_backoff', 'provider_unavailable', 'rate_limit_backoff', 'scan_ready', 'scheduled_later', 'source_down', 'stale_source_data'],
          providerBreakdown: [
            expect.objectContaining({
              providerKey: 'reddit',
              totalBindings: 3,
              staleBindings: 1,
              degradedBindings: 1,
              downBindings: 1,
              rateLimitBackoffSkips: 1,
              providerFailureBackoffSkips: 1,
              providerUnavailableScans: 3,
            }),
            expect.objectContaining({
              providerKey: 'rss',
              totalBindings: 1,
              canScanNowBindings: 1,
            }),
          ],
        }),
      }),
    });
  });

  it('returns list errors without reading per-binding health', async () => {
    const listSourceBindings = {
      execute: jest.fn().mockResolvedValue(err(new DomainError('resource.not_found', 'Topic not found'))),
    };
    const getSourceBindingHealth = { execute: jest.fn() };

    const result = await new ListSourceBindingOverviewUseCase(
      listSourceBindings,
      getSourceBindingHealth,
    ).execute({
      tenantId: tenantId('tenant-overview'),
      workspaceId: workspaceId('workspace-overview'),
      topicId: 'missing-topic',
      limit: 50,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'resource.not_found' }),
    });
    expect(getSourceBindingHealth.execute).not.toHaveBeenCalled();
  });

  it('surfaces duplicate scheduled windows in overview actions and signals', async () => {
    const listSourceBindings = {
      execute: jest.fn().mockResolvedValue(ok({
        sourceBindings: [makeSourceBindingView({ id: 'binding-duplicate' })],
      })),
    };
    const getSourceBindingHealth = {
      execute: jest.fn().mockResolvedValue(ok(makeHealthView({
        sourceBinding: makeSourceBindingView({ id: 'binding-duplicate' }),
        schedulerDecision: {
          canScanNow: false,
          decision: 'duplicate_window',
          reason: 'scheduled_scan_window_already_recorded',
          minimumIntervalSeconds: 300,
          nextEligibleAt: '2026-06-26T00:10:00.000Z',
          waitSeconds: 600,
          signals: ['duplicate_window'],
        },
      }))),
    };

    const result = await new ListSourceBindingOverviewUseCase(
      listSourceBindings,
      getSourceBindingHealth,
    ).execute({
      tenantId: tenantId('tenant-overview'),
      workspaceId: workspaceId('workspace-overview'),
      topicId: 'topic-overview',
      limit: 50,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        summary: expect.objectContaining({
          canScanNowBindings: 0,
          nextEligibleAt: '2026-06-26T00:10:00.000Z',
          operatorAction: 'wait_for_existing_scheduled_scan_window',
          signals: ['duplicate_window'],
        }),
      }),
    });
  });

  it('fails closed if a listed binding cannot be resolved through health scope', async () => {
    const listSourceBindings = {
      execute: jest.fn().mockResolvedValue(ok({
        sourceBindings: [makeSourceBindingView({ id: 'binding-stale' })],
      })),
    };
    const getSourceBindingHealth = {
      execute: jest.fn().mockResolvedValue(err(new DomainError('resource.not_found', 'Source binding not found'))),
    };

    const result = await new ListSourceBindingOverviewUseCase(
      listSourceBindings,
      getSourceBindingHealth,
    ).execute({
      tenantId: tenantId('tenant-overview'),
      workspaceId: workspaceId('workspace-overview'),
      topicId: 'topic-overview',
      limit: 50,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'resource.not_found' }),
    });
  });
});

const makeSourceBindingView = (
  overrides: Partial<SourceBindingView> = {},
): SourceBindingView => ({
  id: 'binding-1',
  tenantId: tenantId('tenant-overview'),
  workspaceId: workspaceId('workspace-overview'),
  topicId: 'topic-overview',
  providerKey: 'fake-source',
  capabilityProfileVersion: 1,
  status: 'enabled',
  configPreview: { query: 'AI infrastructure' },
  createdAt: '2026-06-26T00:00:00.000Z',
  ...overrides,
});

const makeHealthView = (
  overrides: Partial<GetSourceBindingHealthResult> = {},
): GetSourceBindingHealthResult => {
  const defaults: GetSourceBindingHealthResult = {
    sourceBinding: makeSourceBindingView(),
    healthState: 'scheduled',
    operatorAction: 'wait_for_next_run_or_trigger_manual_scan',
    evaluatedAt: '2026-06-26T00:00:00.000Z',
    schedulerDecision: {
      canScanNow: false,
      decision: 'scheduled_later',
      reason: 'scan_not_due_yet',
      minimumIntervalSeconds: 300,
      configuredIntervalSeconds: 900,
      nextEligibleAt: '2026-06-26T00:05:00.000Z',
      waitSeconds: 300,
      signals: ['minimum_interval'],
    },
    recentWindow: {
      providerHealthState: 'unknown',
      windowStartedAt: '2026-06-25T00:00:00.000Z',
      windowEndedAt: '2026-06-26T00:00:00.000Z',
      totalScans: 0,
      succeededScans: 0,
      failedScans: 0,
      activeScans: 0,
      rateLimitedScans: 0,
      providerUnavailableScans: 0,
      consecutiveFailures: 0,
      operatorAction: 'wait_for_next_scan_or_trigger_manual_scan',
      signals: ['no_recent_scans'],
    },
  };

  return {
    ...defaults,
    ...overrides,
    schedulerDecision: overrides.schedulerDecision ?? defaults.schedulerDecision,
  };
};
