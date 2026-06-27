import { err, ok, type DomainError, type Result } from '@social-monitor/shared-kernel';

import type { GetSourceBindingHealthUseCase } from '../get-source-binding-health/get-source-binding-health.use-case';
import type { GetSourceBindingHealthResult } from '../get-source-binding-health/get-source-binding-health.result';
import type { ListSourceBindingsUseCase } from '../list-source-bindings/list-source-bindings.use-case';
import type { ListSourceBindingOverviewQuery } from './list-source-binding-overview.query';
import type {
  ListSourceBindingOverviewResult,
  SourceBindingOverviewProviderBreakdownView,
  SourceBindingOverviewSummaryView,
} from './list-source-binding-overview.result';

type ListSourceBindingOverviewFailure = DomainError;
type ListSourceBindingsExecutor = Pick<ListSourceBindingsUseCase, 'execute'>;
type GetSourceBindingHealthExecutor = Pick<GetSourceBindingHealthUseCase, 'execute'>;

export class ListSourceBindingOverviewUseCase {
  constructor(
    private readonly listSourceBindings: ListSourceBindingsExecutor,
    private readonly getSourceBindingHealth: GetSourceBindingHealthExecutor,
  ) {}

  async execute(
    query: ListSourceBindingOverviewQuery,
  ): Promise<Result<ListSourceBindingOverviewResult, ListSourceBindingOverviewFailure>> {
    const listed = await this.listSourceBindings.execute(query);

    if (!listed.ok) {
      return err(listed.error);
    }

    const healthResults = await Promise.all(
      listed.value.sourceBindings.map((sourceBinding) =>
        this.getSourceBindingHealth.execute({
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          topicId: query.topicId,
          sourceBindingId: sourceBinding.id,
        }),
      ),
    );
    const failed = healthResults.find((result) => !result.ok);

    if (failed !== undefined && !failed.ok) {
      return err(failed.error);
    }

    const items = healthResults.map((result) => {
      if (!result.ok) {
        throw result.error;
      }

      return result.value;
    });

    return ok({
      summary: buildOverviewSummary(items),
      items,
      nextCursor: listed.value.nextCursor,
    });
  }
}

const buildOverviewSummary = (
  items: readonly GetSourceBindingHealthResult[],
): SourceBindingOverviewSummaryView => {
  const providerBreakdown = Array.from(groupByProvider(items).entries())
    .map(([providerKey, providerItems]) => buildProviderBreakdown(providerKey, providerItems))
    .sort((left, right) => left.providerKey.localeCompare(right.providerKey));
  const summary = buildProviderBreakdown('all', items);

  return {
    totalBindings: summary.totalBindings,
    healthyBindings: summary.healthyBindings,
    staleBindings: summary.staleBindings,
    degradedBindings: summary.degradedBindings,
    downBindings: summary.downBindings,
    scanningBindings: summary.scanningBindings,
    pausedBindings: summary.pausedBindings,
    notConfiguredBindings: summary.notConfiguredBindings,
    scheduledBindings: summary.scheduledBindings,
    canScanNowBindings: summary.canScanNowBindings,
    freshSuccessSkips: summary.freshSuccessSkips,
    rateLimitedBindings: summary.rateLimitBackoffSkips,
    providerFailureBackoffSkips: summary.providerFailureBackoffSkips,
    providerUnavailableScans: summary.providerUnavailableScans,
    attentionRequiredBindings: attentionRequiredBindingCount(items),
    nextEligibleAt: summary.nextEligibleAt,
    operatorAction: overviewOperatorAction(items),
    signals: overviewSignals(items),
    providerBreakdown,
  };
};

const groupByProvider = (
  items: readonly GetSourceBindingHealthResult[],
): ReadonlyMap<string, readonly GetSourceBindingHealthResult[]> => {
  const groups = new Map<string, GetSourceBindingHealthResult[]>();

  for (const item of items) {
    const providerKey = item.sourceBinding.providerKey;
    const providerItems = groups.get(providerKey);
    if (providerItems === undefined) {
      groups.set(providerKey, [item]);
    } else {
      providerItems.push(item);
    }
  }

  return groups;
};

const buildProviderBreakdown = (
  providerKey: string,
  items: readonly GetSourceBindingHealthResult[],
): SourceBindingOverviewProviderBreakdownView => ({
  providerKey,
  totalBindings: items.length,
  healthyBindings: countByHealthState(items, 'healthy'),
  staleBindings: countByHealthState(items, 'stale'),
  degradedBindings: countByHealthState(items, 'degraded'),
  downBindings: countByHealthState(items, 'down'),
  scanningBindings: countByHealthState(items, 'scanning'),
  pausedBindings: countByHealthState(items, 'paused'),
  notConfiguredBindings: countByHealthState(items, 'not_configured'),
  scheduledBindings: countByHealthState(items, 'scheduled'),
  canScanNowBindings: items.filter((item) => item.schedulerDecision.canScanNow).length,
  freshSuccessSkips: countBySchedulerDecision(items, 'fresh_success'),
  rateLimitBackoffSkips: countBySchedulerDecision(items, 'rate_limit_backoff'),
  providerFailureBackoffSkips: countBySchedulerDecision(
    items,
    'provider_failure_backoff',
  ),
  providerUnavailableScans: items.reduce(
    (total, item) => total + (item.recentWindow?.providerUnavailableScans ?? 0),
    0,
  ),
  nextEligibleAt: earliestIsoDate(items
    .map((item) => item.schedulerDecision.nextEligibleAt)
    .filter((value): value is string => value !== undefined)),
  signals: overviewSignals(items),
});

const countByHealthState = (
  items: readonly GetSourceBindingHealthResult[],
  healthState: GetSourceBindingHealthResult['healthState'],
): number =>
  items.filter((item) => item.healthState === healthState).length;

const countBySchedulerDecision = (
  items: readonly GetSourceBindingHealthResult[],
  decision: GetSourceBindingHealthResult['schedulerDecision']['decision'],
): number =>
  items.filter((item) => item.schedulerDecision.decision === decision).length;

const attentionRequiredBindingCount = (
  items: readonly GetSourceBindingHealthResult[],
): number =>
  items.filter((item) =>
    item.healthState === 'stale' ||
    item.healthState === 'degraded' ||
    item.healthState === 'down' ||
    item.healthState === 'not_configured' ||
    item.schedulerDecision.decision === 'rate_limit_backoff' ||
    item.schedulerDecision.decision === 'provider_failure_backoff' ||
    (item.recentWindow?.providerUnavailableScans ?? 0) > 0,
  ).length;

const overviewOperatorAction = (
  items: readonly GetSourceBindingHealthResult[],
): string => {
  if (items.length === 0) {
    return 'bind_source_provider';
  }

  if (items.some((item) => item.schedulerDecision.decision === 'rate_limit_backoff')) {
    return 'wait_for_provider_rate_limit_backoff';
  }

  if (items.some((item) => item.schedulerDecision.decision === 'provider_failure_backoff')) {
    return 'check_provider_health_or_credentials';
  }

  if (items.some((item) => item.schedulerDecision.decision === 'duplicate_window')) {
    return 'wait_for_existing_scheduled_scan_window';
  }

  if (items.some((item) =>
    (item.recentWindow?.providerUnavailableScans ?? 0) > 0 ||
    item.healthState === 'down' ||
    item.healthState === 'degraded',
  )) {
    return 'check_provider_health_or_credentials';
  }

  if (items.some((item) => item.healthState === 'not_configured')) {
    return 'create_scan_policy_for_source_binding';
  }

  if (items.some((item) => item.schedulerDecision.canScanNow)) {
    return 'run_due_scans_or_wait_for_scheduler';
  }

  if (items.some((item) => item.healthState === 'stale')) {
    return 'trigger_scan_or_reduce_interval';
  }

  return 'monitor_sources';
};

const overviewSignals = (
  items: readonly GetSourceBindingHealthResult[],
): readonly string[] => {
  const signals = new Set<string>();

  if (items.length === 0) {
    signals.add('no_source_bindings');
  }
  if (items.some((item) => item.schedulerDecision.canScanNow)) {
    signals.add('scan_ready');
  }
  if (items.some((item) => item.healthState === 'not_configured')) {
    signals.add('source_not_configured');
  }
  if (items.some((item) => item.healthState === 'paused')) {
    signals.add('source_paused');
  }
  if (items.some((item) => item.schedulerDecision.decision === 'rate_limit_backoff')) {
    signals.add('rate_limit_backoff');
  }
  if (items.some((item) => item.schedulerDecision.decision === 'provider_failure_backoff')) {
    signals.add('provider_failure_backoff');
  }
  if (items.some((item) => item.schedulerDecision.decision === 'duplicate_window')) {
    signals.add('duplicate_window');
  }
  if (items.some((item) => (item.recentWindow?.providerUnavailableScans ?? 0) > 0)) {
    signals.add('provider_unavailable');
  }
  if (items.some((item) => item.healthState === 'down')) {
    signals.add('source_down');
  }
  if (items.some((item) => item.healthState === 'stale')) {
    signals.add('stale_source_data');
  }
  if (items.some((item) => item.schedulerDecision.decision === 'fresh_success')) {
    signals.add('fresh_success_skip');
  }
  if (items.some((item) => item.schedulerDecision.decision === 'scheduled_later')) {
    signals.add('scheduled_later');
  }
  if (items.length > 0 && items.every((item) => item.healthState === 'healthy')) {
    signals.add('all_sources_healthy');
  }

  return [...signals].sort();
};

const earliestIsoDate = (values: readonly string[]): string | undefined =>
  values
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)
    .map((value) => new Date(value).toISOString())[0];
