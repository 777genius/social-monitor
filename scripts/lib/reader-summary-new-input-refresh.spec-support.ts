import { refreshScope, refreshOperation, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
export const refreshNow = new Date("2026-09-05T22:10:00.000Z");
export function refreshManifest(): RefreshManifest {
  const hash = "a".repeat(64);
  const m: Omit<RefreshManifest, "operation"> = {
    format: "reader-summary-seven-day-new-input-v1", ...refreshScope, date: "2026-09-03",
    startedAt: "2026-09-03T00:00:00.000Z", endedAt: "2026-09-04T00:00:00.000Z", timezone: "UTC",
    preparedAt: "2026-09-05T22:00:00.000Z", observedThrough: "2026-09-05T21:59:00.000Z",
    prior: { artifactId: "00000000-0000-4000-8000-000000000001", jobId: "00000000-0000-4000-8000-000000000002",
      publicationId: "00000000-0000-4000-8000-000000000001", status: "NO_SIGNAL",
      artifactSha256: hash, jobSha256: hash, publicationSha256: hash, reportSha256: hash, proofSha256: hash,
      observedThrough: "2026-09-04T00:00:00.000Z", topCount: 0, additionalCount: 0, citationCount: 0 },
    authority: { datasetSha256: hash, canonicalRowsSha256: hash, engagementSha256: hash, sourceScopeSha256: hash, policySha256: hash,
      canonicalInputSha256: hash, feedCount: 501, eligibleCount: 12, metricRowCount: 800 },
    sourceSha256: hash, deployedSourceSha256: hash, generationSha256: hash,
    runtime: { engine: "subscription-runtime-cli", packageVersion: "0.1.0-main.30", launcherSha256: hash },
    fenceAuthority: { global: "1:2", dates: "1:3", fences: "1:4" },
    model: "gpt-5.6-sol", reasoningEffort: "high",
  };
  return { ...m, operation: refreshOperation(m) };
}
