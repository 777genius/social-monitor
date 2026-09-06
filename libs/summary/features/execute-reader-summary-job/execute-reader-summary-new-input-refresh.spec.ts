import type { ReaderSummaryEvidenceSelectorPort } from "../../ports";
import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob } from "../../domain";
import { ExecuteReaderSummaryJobUseCase } from "./execute-reader-summary-job.use-case";
import { FakeReaderSummaryJobRepository } from "./execute-reader-summary-job.spec-support";
import { PromotionControlArtifactRepository, PromotionControlTrendingModel, PromotionControlEventPublisher,
  PromotionControlIdGenerator, PromotionControlPolicyRepository, PromotionControlPublication,
  promotionControlEmptyTopicMapBuilder } from "./execute-reader-summary-job-promotion-control.spec-support";
import { readerSummaryPromotionControl, NOOP_READER_SUMMARY_PROMOTION_METRICS } from "./reader-summary-promotion-control";
import { makeReaderEvidenceSelection, withReaderPromotionEditorialSlate, githubEvidence } from "../../test-fixtures/execute-reader-summary-job-promotion-fixtures";
import type { ReaderSummaryNewInputRefreshAuthority } from "../../application/contracts/reader-summary-new-input-refresh-authority";

const scope = { tenantId: tenantId("00000000-0000-7000-8000-000000006101"), workspaceId: workspaceId("00000000-0000-7000-8000-000000006102") };
const cutoff = new Date("2026-09-05T21:59:00.000Z");
const now = new Date("2026-09-05T22:10:00.000Z");
async function scenario(admitted = true, empty = false) {
  const jobs = new FakeReaderSummaryJobRepository();
  const old = ReaderSummaryJob.request({ ...scope, id: "prior-job", scope: { type: "workspace" },
    period: { cadence: "daily", startedAt: new Date("2026-09-03T00:00:00Z"), endedAt: new Date("2026-09-04T00:00:00Z"),
      timezone: "UTC", periodKey: "daily:2026-09-03T00:00:00.000Z:2026-09-04T00:00:00.000Z:UTC" },
    idempotencyKey: "prior-normal-key", requestedAt: new Date("2026-09-04T00:01:00Z") });
  await jobs.save(old.start({ startedAt: new Date("2026-09-04T00:02:00Z") }).markNoSignal({ completedAt: new Date("2026-09-04T00:03:00Z"), readerSummaryId: "prior-artifact" }));
  const oldBefore = JSON.stringify(await jobs.findById({ ...scope, readerSummaryJobId: "prior-job" }));
  const job = ReaderSummaryJob.request({ ...old.toSnapshot(), id: "new-job", idempotencyKey: "new-input-refresh:v1:2026-09-03:operation", requestedAt: now });
  await jobs.save(job);
  const artifacts = new PromotionControlArtifactRepository();
  const model = new PromotionControlTrendingModel();
  const githubItems = Array.from({ length: 10 }, (_, index) => ({
    feedItemId: `github-feed-${index + 1}`, sourceItemId: `github-source-${index + 1}`,
    sourceBindingId: "github-binding-daily", providerKey: "github-trending-page",
    metadataKind: "github_trending_page_repository", scanJobId: "github-scan-daily",
    canonicalUrl: `https://github.com/owner/repo-${index + 1}`, repositoryFullName: `owner/repo-${index + 1}`,
    rank: index + 1, starsGained: index < 3 ? 1_101 : 100 + index, window: "daily",
    fetchStartedAt: new Date("2026-09-03T07:19:00Z"), checkedAt: new Date("2026-09-03T07:20:00Z"),
    publishedAt: new Date("2026-09-03T07:20:00Z"), observedAt: new Date("2026-09-03T07:30:00Z"),
    sourceContentHash: "a".repeat(64), sourceProviderContentHash: "b".repeat(64),
  }));
  const select = jest.fn(async (_query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0]) => {
    void _query;
    const evidence = shift(makeReaderEvidenceSelection());
    const item = evidence.selectedEvidence[0]!;
    return withReaderPromotionEditorialSlate({ ...evidence,
      sourceWindow: { ...evidence.sourceWindow, ingestionCutoff: cutoff,
        selectedFeedItemIds: empty ? [] : [item.feedItemId], storyClusterIds: empty ? [] : [evidence.clusters[0]!.id] },
      selectedEvidence: empty ? [] : [{ ...item, promotionFacts: { ...item.promotionFacts!,
        engagementAuthority: { observedAt: new Date("2026-09-05T21:55:00Z"), regressionState: "stable" },
        freshnessProvenance: { status: "observed", publishedAt: item.publishedAt, observedAt: item.observedAt, ingestionCutoff: cutoff },
      } }, ...githubItems.map((item) => ({ ...shift(githubEvidence()), ...item,
        providerMetricLabels: [{ label: "GitHub Trending today", value: `#${item.rank} · +${item.starsGained} stars today` }],
      }))], clusters: empty ? [] : [evidence.clusters[0]!],
    });
  });
  const github = { read: jest.fn(async (_query: unknown) => {
    void _query;
    return { eligibleBindingIds: ["github-binding-daily"], pageCount: 1, items: githubItems };
  }) };
  const authority: ReaderSummaryNewInputRefreshAuthority = { claim: jest.fn(async () => cutoff) };
  const execute = new ExecuteReaderSummaryJobUseCase(jobs, artifacts, new PromotionControlPolicyRepository(), { select }, model,
    new PromotionControlPublication(jobs, artifacts, new PromotionControlEventPublisher()), new PromotionControlIdGenerator(), new FixedClock(now),
    readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS), undefined, undefined,
    promotionControlEmptyTopicMapBuilder(), undefined, github, undefined, undefined, undefined, admitted ? authority : undefined);
  const result = await execute.execute({ ...scope, readerSummaryJobId: "new-job" });
  return { result, jobs, model, select, github, artifacts, oldBefore };
}
describe("canonical execution admission for historical new inputs", () => {
  it("keeps an ordinary worker from executing a reserved operation", async () => {
    const s = await scenario(false);
    expect(s.result).toMatchObject({ ok: false });
    expect(s.select).not.toHaveBeenCalled();
    expect(s.model.generatedEvidenceIds()).toEqual([]);
  });
  it("threads the accepted cutoff to selection and GitHub checks while generation stays real", async () => {
    const s = await scenario();
    expect(s.result).toMatchObject({ ok: true, value: { status: "completed" } });
    expect((await s.jobs.findById({ ...scope, readerSummaryJobId: "prior-job" }))?.toSnapshot().status).toBe("no_signal");
    expect(s.select.mock.calls[0]?.[0]).toMatchObject({ observedThrough: cutoff });
    expect(s.github.read.mock.calls[0]?.[0]).toMatchObject({ observedThrough: cutoff });
    expect(s.artifacts.all()[0]?.toSnapshot().generatedAt).toEqual(now);
    expect(JSON.stringify(await s.jobs.findById({ ...scope, readerSummaryJobId: "prior-job" }))).toBe(s.oldBefore);
    expect(s.model.generatedEvidenceIds()).toHaveLength(1);
  });
  it("empty current input produces truthful NO_SIGNAL without a model", async () => {
    const s = await scenario(true, true);
    expect(s.result).toMatchObject({ ok: true, value: { status: "no_signal" } });
    expect(s.model.generatedEvidenceIds()).toEqual([]);
  });
});

function shift<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime() + Date.parse("2026-09-03T00:00:00Z") - Date.parse("2026-06-26T00:00:00Z")) as T;
  if (Array.isArray(value)) return value.map(shift) as T;
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shift(v)])) as T;
  return value;
}
