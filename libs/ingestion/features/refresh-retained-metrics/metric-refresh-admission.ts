import type { MetricRefreshManifest, RefreshDigest, RefreshScope, RetainedMetricTarget } from "./refresh-retained-metrics.contracts";

export const metricRefreshTenant = "00000000-0000-7000-8000-000000006101";
export const metricRefreshWorkspace = "00000000-0000-7000-8000-000000006102";
export const metricRefreshDates = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
export const metricRefreshEvidencePath = "seven-day-6101-6102/retained-metrics-v1";
export const metricRefreshTargetLimit = 10_000;
export const metricRefreshSourceBase = "e1e82c01cf3287c0d5ef3aa3bd1d3b93eae9a8fd";
export const metricRefreshBounds = { targets: 10_000, redditBatch: 100, hnBatch: 1, attempts: 1, concurrency: 1, timeoutMs: 10_000 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function scopeProblem(scope: RefreshScope, now: Date): string | null {
  if (scope.tenantId !== metricRefreshTenant || scope.workspaceId !== metricRefreshWorkspace) return "wrong_scope";
  if (!scope.dates.length || new Set(scope.dates).size !== scope.dates.length ||
      scope.dates.some((date) => !metricRefreshDates.includes(date) || date > now.toISOString().slice(0, 10))) return "invalid_dates";
  const end = Date.parse(scope.endAt);
  if (!Number.isFinite(end) || new Date(end).toISOString() !== scope.endAt || end > now.getTime() ||
      end <= Date.parse(`${scope.dates.at(-1)}T00:00:00Z`) || end > Date.parse("2026-09-06T00:00:00Z") ||
      scope.dates.join() !== [...scope.dates].sort().join()) return "invalid_cutoff";
  return null;
}
export function normalizedRefreshId(provider: string, id: string): string | null {
  if (provider === "hacker-news" && /^hn:[1-9]\d*$/u.test(id) && Number.isSafeInteger(Number(id.slice(3)))) return id.slice(3);
  if (provider === "reddit" && /^reddit:(?:t3_)?[a-z0-9]+$/u.test(id)) return `t3_${id.replace(/^reddit:(?:t3_)?/u, "")}`;
  return null;
}
export function targetProblem(target: RetainedMetricTarget, scope: RefreshScope): string | null {
  if (target.tenantId !== scope.tenantId || target.workspaceId !== scope.workspaceId) return "wrong_scope";
  const time = Date.parse(target.publishedAt);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== target.publishedAt ||
      !scope.dates.includes(target.publishedAt.slice(0, 10)) || time >= Date.parse(scope.endAt)) return "out_of_range";
  if (target.rejection !== null) return target.rejection;
  if (!uuid.test(target.sourceBindingId) || !uuid.test(target.sourceItemId) || target.visibleFeedCount > 1000 || target.visibleFeedCount < 0) return "unbound_or_fanout";
  if ([target.configDigest, target.identityDigest, target.feedDigest].some((value) => !/^[a-f0-9]{64}$/u.test(value))) return "invalid_digest";
  const id = normalizedRefreshId(target.providerKey, target.externalId);
  if (id === null) return "invalid_source_id";
  try {
    const url = new URL(target.canonicalUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return "url_mismatch";
    if (target.providerKey === "hacker-news") {
      if (url.hostname !== "news.ycombinator.com" || url.pathname !== "/item" || url.search !== `?id=${id}`) return "url_mismatch";
    } else if (!["www.reddit.com", "reddit.com", "old.reddit.com"].includes(url.hostname) ||
        !new RegExp(`^/(?:r/[^/]+/)?comments/${id.slice(3)}(?:/|$)`, "u").test(url.pathname)) return "url_mismatch";
  } catch { return "url_mismatch"; }
  return null;
}
export const targetIdentity = (target: RetainedMetricTarget): Omit<RetainedMetricTarget, "authority"> =>
  Object.fromEntries(Object.entries(target).filter(([key]) => key !== "authority")) as Omit<RetainedMetricTarget, "authority">;
export function manifestProblem(manifest: MetricRefreshManifest, now: Date): string | null {
  if (manifest.sourceBase !== metricRefreshSourceBase || !manifest.bounds || Object.entries(metricRefreshBounds).some(([key, value]) => manifest.bounds[key as keyof typeof metricRefreshBounds] !== value)) return "invalid_bounds_or_base";
  if (manifest.version !== "retained-metrics.v1" || manifest.evidencePath !== metricRefreshEvidencePath ||
      !uuid.test(manifest.operationId)) return "invalid_operation";
  const scopeError = scopeProblem(manifest.scope, now);
  if (scopeError) return scopeError;
  if (!Number.isFinite(Date.parse(manifest.plannedAt)) || new Date(manifest.plannedAt).toISOString() !== manifest.plannedAt || Date.parse(manifest.plannedAt) > now.getTime() || Date.parse(manifest.scope.endAt) > Date.parse(manifest.plannedAt)) return "invalid_plan_time";
  if (manifest.targets.length > metricRefreshTargetLimit) return "inventory_limit";
  const ids = new Set<string>();
  const rows = new Set<string>();
  for (const target of manifest.targets) {
    const error = targetProblem(target, manifest.scope);
    if (error) return error;
    const key = `${target.providerKey}:${normalizedRefreshId(target.providerKey, target.externalId)}`;
    if (ids.has(key) || rows.has(target.sourceItemId)) return "duplicate_source_id";
    ids.add(key); rows.add(target.sourceItemId);
  }
  return null;
}
export function sameTarget(a: RetainedMetricTarget, b: RetainedMetricTarget | null, hash: RefreshDigest): boolean {
  return b !== null && hash(targetIdentity(a)) === hash(targetIdentity(b));
}
export function refreshBatches(targets: readonly RetainedMetricTarget[]): RetainedMetricTarget[][] {
  const batches: RetainedMetricTarget[][] = [];
  for (const target of [...targets].sort((a, b) => `${a.providerKey}:${a.sourceBindingId}:${a.externalId}`.localeCompare(`${b.providerKey}:${b.sourceBindingId}:${b.externalId}`))) {
    const last = batches.at(-1);
    if (target.providerKey === "reddit" && last?.[0]?.providerKey === "reddit" && last[0].sourceBindingId === target.sourceBindingId && last.length < 100) last.push(target);
    else batches.push([target]);
  }
  return batches;
}
