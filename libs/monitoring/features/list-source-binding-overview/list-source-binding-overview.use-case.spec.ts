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
): GetSourceBindingHealthResult => ({
  sourceBinding: makeSourceBindingView(),
  healthState: 'scheduled',
  operatorAction: 'wait_for_next_run_or_trigger_manual_scan',
  evaluatedAt: '2026-06-26T00:00:00.000Z',
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
  ...overrides,
});
