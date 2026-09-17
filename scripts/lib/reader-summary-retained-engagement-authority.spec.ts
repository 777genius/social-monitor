import { createHash } from "node:crypto";
import { currentDatabaseAccess } from "@social-monitor/platform-persistence";
import { retainedPromotionAuthorityProjectionSql } from "@social-monitor/feed/adapters/persistence/prisma/retained-promotion-authority-projection";
import { exactPromotionPageEvidence } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-promotion-exact-evidence";
import type { PrismaFeedClient } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-client";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { captureReaderSummaryDayDatasetManifest, parseReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-manifest";
import { DatasetGuardedReaderSummaryEvidenceSelector, ReaderSummaryDayDatasetGuard } from "./reader-summary-day-dataset-guard";
import { buildHistoricalPromotionCanonicalInput } from "./reader-summary-promotion-v2-historical-input";
import { historicalPromotionGenerationAuthority } from "./reader-summary-promotion-v2-historical-generation-authority";
import { PostgresHistoricalPromotionPreparationReader } from "./reader-summary-promotion-v2-historical-preparation-postgres";

const scope = { tenantId: "33333333-3333-4333-8333-333333333333", workspaceId: "44444444-4444-4444-8444-444444444444" };
const startedAt = new Date("2026-09-10T00:00:00.000Z");
const endedAt = new Date("2026-09-11T00:00:00.000Z");
const generatedAt = new Date("2026-09-15T14:20:00.000Z");
const id = "55555555-5555-4555-8555-555555555555";
const observation = "2026-09-15T01:03:27.135Z";
const projection = (patch: Record<string, unknown> = {}) => JSON.stringify({ feedItemId: id, sourceItemId: "source-fixture",
  ...scope, providerKey: "reddit", providerMetadata: { kind: "reddit_post", score: 90 },
  publishedAt: startedAt.toISOString(), observedAt: startedAt.toISOString(),
  snapshot: { last_observed_at: observation, last_changed_at: observation, metrics_hash: "fixture-hash", score: 90 },
  observations: [{ observed_at: observation, metrics_hash: "fixture-hash", has_regression: false, score: 90 }], ...patch });
const client = (getProjection: () => string = projection) => ({
  $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
    if (strings.join("").includes("AS projection")) return [{ projection: getProjection() }];
    if (strings.join("").includes('as "providerKey"')) return [{ providerKey: "reddit", rowJson: "fixed-feed-and-source-fixture" }];
    return [];
  }),
});
const capture = (db = client()) => captureReaderSummaryDayDatasetManifest({ client: db as never,
  ...scope, startedAt, endedAt, generatedAt, retainedAuthorityBoundThrough: generatedAt });
const canonical = (manifest: Awaited<ReturnType<typeof capture>>) => buildHistoricalPromotionCanonicalInput({
  date: "2026-09-10", sourcePublication: { kind: "active-database-publication", publicationId: id,
    artifactId: id, reportSha256: "a".repeat(64), proofSha256: "b".repeat(64) },
  datasetManifest: manifest, datasetManifestSha256: "c".repeat(64),
  supportingEvidence: { kind: "active-database-publication" },
  generationAuthority: historicalPromotionGenerationAuthority({ ...scope, env: {} }), allowHistoricalGitHubOmission: false,
});
const selectionParams = { tenantId: tenantId(scope.tenantId), workspaceId: workspaceId(scope.workspaceId),
  scope: { type: "workspace" as const }, period: { cadence: "daily" as const, startedAt, endedAt, timezone: "UTC", periodKey: "fixture" }, maxItems: 10 };

describe("historical retained metric binding", () => {
  it("captures the explicitly requested projection under tenant scope and uses the same SQL/hash at runtime", async () => {
    const accesses: unknown[] = [];
    const db = client(() => { accesses.push(currentDatabaseAccess()); return projection(); });
    const manifest = await capture(db);
    const retained = manifest.retainedEngagementAuthority!;
    expect(accesses).toEqual([{ kind: "tenant", ...scope }]);
    expect(retained).toMatchObject({ mode: "retained-current-authority", boundThrough: generatedAt.toISOString(),
      bindings: [{ feedItemId: id, cutoffAt: observation, authoritySha256: createHash("sha256").update(projection()).digest("hex") }] });
    expect(db.$queryRaw.mock.calls[0]![0].join("?")).toContain(retainedPromotionAuthorityProjectionSql);
    expect(db.$queryRaw).toHaveBeenCalledWith(expect.anything(), scope.tenantId, scope.workspaceId, startedAt, endedAt);
    const query = jest.fn().mockResolvedValue([{ id, retainedProjection: projection(), engagementObservedAt: observation,
      engagementChangedAt: observation, engagementMetricsHash: "fixture-hash", latestObservationAt: observation,
      latestObservationMetricsHash: "fixture-hash", latestObservationHasRegression: false,
      currentHasRegressionFromLatest: false, previousObservationAt: null }]);
    const runtime = await exactPromotionPageEvidence({ $queryRawUnsafe: query } as unknown as PrismaFeedClient,
      [id], generatedAt, true);
    expect(query.mock.calls[0]![0]).toContain(retainedPromotionAuthorityProjectionSql);
    expect(runtime.get(id)?.retainedAuthoritySha256).toBe(retained.bindings[0]!.authoritySha256);
    expect(runtime.get(id)?.metricAuthority?.observedAt.toISOString()).toBe(observation);
    expect(canonical(manifest).envelope.retainedEngagementAuthority).toEqual({ mode: retained.mode,
      projection: retained.projection, boundThrough: retained.boundThrough, bindingsSha256: retained.bindingsSha256 });
  });

  it.each(["latestObservationAt", "engagementChangedAt"] as const)(
    "rejects a submillisecond %s after its bound snapshot without changing the live resolver", async (field) => {
      const row = { id, retainedProjection: projection(), engagementObservedAt: "2026-09-15T01:03:27.135000Z",
        engagementChangedAt: "2026-09-15T01:03:27.135000Z", engagementMetricsHash: "fixture-hash",
        latestObservationAt: "2026-09-15T01:03:27.135000Z", latestObservationMetricsHash: "fixture-hash",
        latestObservationHasRegression: false, currentHasRegressionFromLatest: false, previousObservationAt: null,
        [field]: "2026-09-15T01:03:27.135001Z" };
      const query = jest.fn().mockResolvedValue([row]);
      const evidence = await exactPromotionPageEvidence({ $queryRawUnsafe: query } as unknown as PrismaFeedClient,
        [id], generatedAt, true);
      expect(evidence.get(id)?.metricAuthority).toBeDefined();
      expect(evidence.get(id)?.retainedAuthorityObservedAt).toBeUndefined();
    },
  );

  it.each([
    { providerMetadata: { kind: "reddit_post", score: 91 } },
    { snapshot: { last_observed_at: "2026-09-15T01:04:00.000Z", score: 90 } },
    { snapshot: { last_observed_at: observation, metrics_hash: "changed-hash", score: 90 } },
    { observations: [{ observed_at: observation, has_regression: true, score: 90 }] },
    { observations: [{ observed_at: observation }, { observed_at: "2026-09-15T00:00:00.000Z", has_regression: true }] },
    { observations: [] }, { snapshot: null }, { sourceItemId: "different-source" },
    { observedAt: "2026-09-16T00:00:00.000Z" },
  ])("changes canonical authority when a retained input changes: %j", async (patch) => {
    const before = await capture();
    const after = await capture(client(() => projection(patch)));
    // The old manifest hash alone does not cover these mutable durable tables.
    expect(before.dataset.aggregateSha256).toBe(after.dataset.aggregateSha256);
    expect(canonical(before).authoritativeInputDigest).not.toBe(canonical(after).authoritativeInputDigest);
  });

  it("fails closed when bindings or their digest are edited independently", async () => {
    const manifest = await capture();
    const edited = { ...manifest, retainedEngagementAuthority: { ...manifest.retainedEngagementAuthority!,
      bindings: [{ ...manifest.retainedEngagementAuthority!.bindings[0]!, cutoffAt: generatedAt.toISOString() }] } };
    expect(() => canonical(edited)).toThrow("authority contract is invalid");
    expect(() => parseReaderSummaryDayDatasetManifest(Buffer.from(JSON.stringify(edited)))).toThrow();
    const differentCutoff = { ...manifest, generatedAt: "2026-09-15T14:21:00.000Z" };
    expect(() => canonical(differentCutoff)).toThrow("cutoff must match");
  });

  it("activates capture only from the preparation's explicit retained authorization", async () => {
    const db = client();
    const reader = new PostgresHistoricalPromotionPreparationReader(db as never, scope, {});
    const live = await reader.captureDataset({ date: "2026-09-10", generatedAt, timestampPolicy: "published_at" });
    expect(live.retainedEngagementAuthority).toBeUndefined();
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    const retained = await reader.captureDataset({ date: "2026-09-10", generatedAt, timestampPolicy: "published_at",
      retainedCurrentAuthority: true });
    expect(retained.retainedEngagementAuthority).toBeDefined();
    await expect(reader.captureDataset({ date: "2026-09-10", generatedAt, timestampPolicy: "observed_at",
      retainedCurrentAuthority: true })).rejects.toThrow("requires published_at");
  });

  it("checks durable drift before invoking the evidence selector", async () => {
    const manifest = await capture();
    const db = client(() => projection({ observations: [] }));
    const guard = new ReaderSummaryDayDatasetGuard(db as never, manifest, "a".repeat(64), () => generatedAt);
    const select = jest.fn();
    const selector = new DatasetGuardedReaderSummaryEvidenceSelector({ select }, guard, true);
    await expect(selector.select(selectionParams)).rejects.toThrow("dataset changed");
    expect(select).not.toHaveBeenCalled();
  });

  it("checks durable drift after selection and forwards authority only on an authorized rebuild", async () => {
    const manifest = await capture();
    let changed = false;
    const db = client(() => projection(changed ? { observations: [] } : {}));
    const guard = new ReaderSummaryDayDatasetGuard(db as never, manifest, "a".repeat(64), () => generatedAt);
    const select = jest.fn(async () => { changed = true; return {} as never; });
    await expect(new DatasetGuardedReaderSummaryEvidenceSelector({ select }, guard, true)
      .select(selectionParams)).rejects.toThrow("dataset changed at after_evidence_selection");
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ timestampPolicy: "published_at",
      retainedEngagementAuthority: manifest.retainedEngagementAuthority }));
    changed = false;
    const ordinary = jest.fn(async () => ({} as never));
    const liveGuard = new ReaderSummaryDayDatasetGuard(db as never, manifest, "a".repeat(64), () => generatedAt);
    await new DatasetGuardedReaderSummaryEvidenceSelector({ select: ordinary }, liveGuard).select(selectionParams);
    expect(ordinary).toHaveBeenCalledWith(expect.not.objectContaining({ retainedEngagementAuthority: expect.anything() }));
  });

  it("locks and revalidates engagement tables inside the publication transaction", async () => {
    const manifest = await capture();
    const db = client();
    const guard = new ReaderSummaryDayDatasetGuard(db as never, manifest, "a".repeat(64), () => generatedAt);
    await guard.assertCurrent("before_evidence_selection");
    await guard.assertCurrent("after_evidence_selection");
    const executeRaw = jest.fn(async () => 0);
    await guard.assertCurrentForPublicationTransaction({ ...db, $executeRaw: executeRaw } as never);
    expect(executeRaw.mock.calls.flat().join(" ")).toContain("source_item_engagement_snapshots, source_item_engagement_observations");
    expect(guard.evidence().completedPhases).toEqual(["before_evidence_selection", "after_evidence_selection", "before_publication"]);
  });
});
