import { createHash } from "node:crypto";
import { readerSummaryNewInputRefreshPrefix } from
  "@social-monitor/summary/application/contracts/reader-summary-new-input-refresh-authority";

export const refreshScope = Object.freeze({
  tenantId: "00000000-0000-7000-8000-000000006101",
  workspaceId: "00000000-0000-7000-8000-000000006102",
});
export const refreshDates = Object.freeze([
  "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02",
  "2026-09-03", "2026-09-04", "2026-09-05",
]);
export type RefreshPrior = Readonly<{
  artifactId: string; jobId: string; publicationId: string;
  artifactSha256: string; jobSha256: string; publicationSha256: string;
  reportSha256: string; proofSha256: string; observedThrough: string;
  status: "COMPLETED" | "NO_SIGNAL";
  topCount: number; additionalCount: number; citationCount: number;
}>;
export type RefreshAuthority = Readonly<{
  datasetSha256: string; canonicalRowsSha256: string; engagementSha256: string; sourceScopeSha256: string;
  policySha256: string; canonicalInputSha256: string;
  feedCount: number; eligibleCount: number; metricRowCount: number;
}>;
export type RefreshManifest = Readonly<{
  format: "reader-summary-seven-day-new-input-v1";
  tenantId: string; workspaceId: string; date: string;
  startedAt: string; endedAt: string; timezone: "UTC";
  observedThrough: string; preparedAt: string;
  prior: RefreshPrior; authority: RefreshAuthority;
  sourceSha256: string; deployedSourceSha256: string; generationSha256: string;
  runtime: Readonly<{ engine: string; packageVersion: string; launcherSha256: string }>;
  fenceAuthority: Readonly<{ global: string; dates: string; fences: string }>;
  model: "gpt-5.6-sol"; reasoningEffort: "high";
  operation: string;
}>;
export const refreshHash = (value: unknown): string => createHash("sha256")
  .update(canonical(value)).digest("hex");
export const refreshBytesHash = (value: Uint8Array): string => createHash("sha256")
  .update(value).digest("hex");
export const refreshKeyPrefix = (date: string): string =>
  `${readerSummaryNewInputRefreshPrefix}${date}:`;
// Cutoff, capture time and path are intentionally absent: recapture cannot buy
// another generation. Authority includes all metric rows, including observedAt.
export const refreshOperation = (m: Omit<RefreshManifest, "operation">): string =>
  refreshKeyPrefix(m.date) + refreshHash({
    scope: [m.tenantId, m.workspaceId, m.startedAt, m.endedAt, m.timezone],
    prior: m.prior, input: m.authority,
    source: m.sourceSha256, deployed: m.deployedSourceSha256, generation: m.generationSha256,
    runtime: m.runtime, model: m.model, effort: m.reasoningEffort,
  });

export function assertRefreshManifest(m: RefreshManifest, now: Date, fresh = true): void {
  if (m.format !== "reader-summary-seven-day-new-input-v1" ||
      m.tenantId !== refreshScope.tenantId || m.workspaceId !== refreshScope.workspaceId ||
      !refreshDates.includes(m.date) || m.timezone !== "UTC" ||
      m.startedAt !== `${m.date}T00:00:00.000Z` ||
      m.endedAt !== new Date(Date.parse(m.startedAt) + 86_400_000).toISOString() ||
      m.model !== "gpt-5.6-sol" || m.reasoningEffort !== "high" ||
      m.sourceSha256 !== m.deployedSourceSha256 ||
      m.runtime.engine !== "subscription-runtime-cli" ||
      m.runtime.packageVersion.trim().length === 0 ||
      !["COMPLETED", "NO_SIGNAL"].includes(m.prior.status) ||
      m.operation !== refreshOperation(m)) {
    throw new Error("Refresh manifest scope, period, policy or identity is invalid");
  }
  if (!m.fenceAuthority || ![m.fenceAuthority.global, m.fenceAuthority.dates, m.fenceAuthority.fences]
    .every((v) => /^\d+:\d+$/u.test(v))) throw new Error("Refresh canonical fence authority is invalid");
  for (const id of [m.prior.artifactId, m.prior.jobId, m.prior.publicationId]) {
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(id)) {
      throw new Error("Refresh prior identity is invalid");
    }
  }
  for (const hash of [m.sourceSha256, m.generationSha256, m.runtime.launcherSha256,
    m.prior.artifactSha256, m.prior.jobSha256, m.prior.publicationSha256, m.prior.reportSha256, m.prior.proofSha256,
    m.authority.datasetSha256, m.authority.canonicalRowsSha256, m.authority.engagementSha256, m.authority.sourceScopeSha256,
    m.authority.policySha256, m.authority.canonicalInputSha256]) {
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/u.test(hash)) {
      throw new Error("Refresh authority digest is invalid");
    }
  }
  const [cutoff, prepared, prior] = [m.observedThrough, m.preparedAt, m.prior.observedThrough]
    .map((s) => {
      const d = new Date(s);
      if (!Number.isFinite(d.getTime()) || d.toISOString() !== s) {
        throw new Error("Refresh cutoff must be an exact real timestamp");
      }
      return d.getTime();
    }) as [number, number, number];
  if (cutoff <= prior || cutoff < Date.parse(m.startedAt) || cutoff > prepared ||
      prepared > now.getTime() || (fresh && (now.getTime() - prepared > 30 * 60_000 || now.getTime() - cutoff > 30 * 60_000))) {
    throw new Error("Refresh observation/review cutoff is invalid or stale");
  }
  for (const count of [m.authority.feedCount, m.authority.eligibleCount,
    m.authority.metricRowCount, m.prior.topCount, m.prior.additionalCount, m.prior.citationCount]) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Refresh count is invalid");
  }
}
function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
}
