import type { ReaderValueDiscoveryScope } from '@social-monitor/relevance/application/contracts/reader-value-assessment-store';
import { resolveIntelligenceReaderSummaryJobLoopOptions } from './intelligence-worker-provider-tokens';

export type ReaderValueRuntimeMode = 'legacy_v2' | 'jev_shadow' | 'jev_primary_v3';
export type ReaderValueRuntimeOptions = {
  readonly mode: ReaderValueRuntimeMode;
  readonly scoringLoopEnabled: boolean;
  readonly discoveryScopes: readonly ReaderValueDiscoveryScope[];
  readonly discoverAllActiveScopes: boolean;
  readonly backfillFrom: string | null;
  /** Frozen work is authorized by durable job pins, not the current discovery allowlist. */
  readonly drainFrozenInputs: boolean;
  readonly tickMs: 10_000;
  readonly discoveryLimit: 100;
  readonly scopePageLimit: 25;
  readonly concurrency: 2;
};

/** Composition policy only; resolving options neither starts HTTP nor activates a V3 writer. */
export function resolveReaderValueRuntimeOptions(env: NodeJS.ProcessEnv): ReaderValueRuntimeOptions {
  const mode = env.READER_VALUE_MODE ?? 'jev_primary_v3';
  if (mode !== 'legacy_v2' && mode !== 'jev_shadow' && mode !== 'jev_primary_v3') {
    throw new Error('READER_VALUE_MODE must be legacy_v2, jev_shadow or jev_primary_v3');
  }
  const loop = env.READER_VALUE_SCORING_LOOP ?? (mode === 'legacy_v2' ? 'disabled' : 'enabled');
  if (loop !== 'enabled' && loop !== 'disabled') throw new Error('READER_VALUE_SCORING_LOOP must be enabled or disabled');
  if ((mode !== 'legacy_v2' || loop === 'enabled') && env.RELEVANCE_PERSISTENCE !== 'prisma') {
    throw new Error('Reader value scoring requires RELEVANCE_PERSISTENCE=prisma');
  }
  if (mode !== 'legacy_v2' && loop !== 'enabled') throw new Error('Jev mode requires an enabled assessment loop');
  const scopes = readScopes(env.READER_VALUE_DISCOVERY_SCOPES);
  if (mode === 'jev_shadow' && (scopes.length === 0 || env.READER_VALUE_BACKFILL_FROM === undefined)) {
    throw new Error('Jev shadow requires explicit discovery scopes and backfill window');
  }
  if (mode !== 'legacy_v2' && env.READER_VALUE_DISCOVERY_SCOPES !== undefined && scopes.length === 0) {
    throw new Error('Jev discovery scope override must not be empty');
  }
  const backfill = env.READER_VALUE_BACKFILL_FROM ??
    (mode === 'jev_primary_v3' ? new Date(Date.now() - 7 * 86_400_000).toISOString() : undefined);
  if (backfill !== undefined && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(backfill)
    || !Number.isFinite(Date.parse(backfill)) || new Date(backfill).toISOString().slice(0, 19) !== backfill.slice(0, 19))) {
    throw new Error('READER_VALUE_BACKFILL_FROM must be a valid UTC timestamp with at most microsecond precision');
  }
  if (mode === 'jev_primary_v3') {
    if (env.SUMMARY_PERSISTENCE !== 'prisma') {
      throw new Error('Primary Jev mode requires SUMMARY_PERSISTENCE=prisma');
    }
    const poller = resolveIntelligenceReaderSummaryJobLoopOptions(env);
    if (!poller.enabled) throw new Error('Primary Jev mode requires an enabled reader summary due poller');
    if (poller.tenantId !== undefined && (env.READER_VALUE_DISCOVERY_SCOPES === undefined ||
      scopes.some((scope) => scope.tenantId !== poller.tenantId?.toLowerCase()
      || scope.workspaceId !== poller.workspaceId?.toLowerCase()))) {
      throw new Error('Reader summary due poller must cover every Jev discovery scope');
    }
  }
  return Object.freeze({
    mode, scoringLoopEnabled: loop === 'enabled', discoveryScopes: Object.freeze(mode === 'legacy_v2' ? [] : scopes),
    discoverAllActiveScopes: mode === 'jev_primary_v3' && env.READER_VALUE_DISCOVERY_SCOPES === undefined,
    backfillFrom: mode === 'legacy_v2' ? null : backfill!, drainFrozenInputs: loop === 'enabled',
    tickMs: 10_000, discoveryLimit: 100, scopePageLimit: 25, concurrency: 2,
  });
}

function readScopes(value: string | undefined): readonly ReaderValueDiscoveryScope[] {
  if (value === undefined) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error('READER_VALUE_DISCOVERY_SCOPES must be a JSON array of exact interest scopes'); }
  if (!Array.isArray(parsed) || parsed.length > 1000) throw new Error('Reader value discovery permits at most 1000 explicit scopes');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  const scopes = new Map<string, ReaderValueDiscoveryScope>();
  for (const value of parsed as unknown[]) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid reader value scope');
    const scope = value as Record<string, unknown>;
    if (Object.keys(scope).length !== 3 || typeof scope.tenantId !== 'string' ||
      typeof scope.workspaceId !== 'string' || typeof scope.interestId !== 'string' ||
      !uuid.test(scope.tenantId) || !uuid.test(scope.workspaceId) ||
      !uuid.test(scope.interestId)) throw new Error('Invalid reader value scope');
    const normalized = Object.freeze({ tenantId: scope.tenantId.toLowerCase(),
      workspaceId: scope.workspaceId.toLowerCase(), interestId: scope.interestId.toLowerCase() });
    scopes.set(`${normalized.tenantId}/${normalized.workspaceId}/${normalized.interestId}`, normalized);
  }
  return [...scopes.values()];
}
