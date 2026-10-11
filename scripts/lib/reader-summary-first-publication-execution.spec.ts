import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { buildOpenAiReaderSummaryPromptPayload } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-prompt";
import { FeedItem } from "@social-monitor/feed/domain";
import { githubProjectionInput } from "@social-monitor/summary/domain/policies/reader-summary-github-projection-policy.spec-support";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob, buildReaderSummaryPeriod } from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { cutoffScenario } from "./reader-summary-capture-execution.spec-support";
import { DatasetGuardedReaderSummaryEvidenceSelector } from "./reader-summary-day-dataset-guard";
import { firstpubFixture, firstpubStart, firstpubEnd, firstpubAsOf, firstpubScope } from "./reader-summary-first-publication.spec-support";

async function scenario(sharedInventory?: Awaited<ReturnType<typeof firstpubFixture>>, reserve = true) {
  const inventory = sharedInventory ?? await firstpubFixture(); const op = inventory.operation();
  if (reserve) await op.reserve();
  const job = ReaderSummaryJob.request({ tenantId: tenantId(firstpubScope.tenantId), workspaceId: workspaceId(firstpubScope.workspaceId),
    id: "cutoff-job", scope: { type: "workspace" }, idempotencyKey: op.idempotencyKey, requestedAt: firstpubAsOf,
    period: buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC", startedAt: firstpubStart, endedAt: firstpubEnd }) });
  const s = await cutoffScenario({ job, historicalAsOf: firstpubAsOf });
  const checkedAt = new Date(firstpubStart.getTime() + 12 * 3600_000);
  const board = githubProjectionInput({ checkedAt, publishedAt: checkedAt,
    fetchStartedAt: new Date(checkedAt.getTime() - 60_000), observedAt: new Date(firstpubEnd.getTime() + 12 * 3600_000) });
  for (const item of board) {
    s.feed.upsert(FeedItem.publish({ tenantId: tenantId(firstpubScope.tenantId), workspaceId: workspaceId(firstpubScope.workspaceId),
      id: item.feedItemId, interestId: "fixture-interest", sourceItemId: item.sourceItemId, sourceBindingId: item.sourceBindingId,
      providerKey: "github-trending-page", canonicalUrl: item.canonicalUrl, title: item.repositoryFullName!,
      bodyPreview: "Available repository for developer runtime tooling.", publishedAt: item.publishedAt, observedAt: item.observedAt,
      providerMetadata: { kind: "github_trending_page_repository", repository: { fullName: item.repositoryFullName!, totalStars: 20000 },
        trending: { rank: item.rank!, starsGained: item.starsGained!, window: "daily" } } }));
  }
  s.github.read.mockImplementation(async () => ({ eligibleBindingIds: ["github-binding-a"], items: board, pageCount: 1 }));
  s.dependencies[3] = new DatasetGuardedReaderSummaryEvidenceSelector(s.selector, op.guard);
  s.dependencies[7] = inventory.clock;
  const generate = s.generate.getMockImplementation()!;
  s.generate.mockImplementation(async (input, route) => {
    inventory.advance(3600_000);
    return generate(input, route);
  });
  s.dependencies[20] = op;
  return { ...s, inventory, op, execute: new ExecuteReaderSummaryJobUseCase(...s.dependencies),
    command: { tenantId: tenantId(firstpubScope.tenantId), workspaceId: workspaceId(firstpubScope.workspaceId), readerSummaryJobId: "cutoff-job" } };
}

it("completed-day late backfill enters genuine generation through manifest authority, with fixed cutoff and honest partial quality", async () => {
  const s = await scenario();
  const result = await s.execute.execute(s.command);
  if (!result.ok) throw result.error;
  if (result.value.status !== "completed") {
    throw new Error((await s.jobs.findById(s.command))!.toSnapshot().failureReason);
  }
  expect(result).toMatchObject({ ok: true, value: { status: "completed" } });
  expect(s.generate).toHaveBeenCalledTimes(1);
  expect(s.inventory.clock.now().getTime()).toBeGreaterThan(firstpubAsOf.getTime() + 3600_000);
  const input = s.generate.mock.calls[0]![0];
  expect(input.evidence.selectedEvidence.filter((item) => item.providerKey !== "github-trending-page").map((item) => item.feedItemId)).toEqual(["primary-early", "primary-late"]);
  expect(input.evidence.sourceWindow).toMatchObject({ ingestionCutoff: firstpubAsOf, exactIngestionCutoff: "2026-10-01T10:00:00.000000Z",
    windowId: `inventory-manifest:${s.inventory.input.manifestSha256}:${firstpubAsOf.toISOString()}` });
  const prompt = JSON.parse(buildOpenAiReaderSummaryPromptPayload(input)) as { editorialSlate: { digestMaterial: string } };
  expect(JSON.parse(prompt.editorialSlate.digestMaterial).sourceWindow).toMatchObject({
    windowId: input.evidence.sourceWindow.windowId, ingestionCutoff: firstpubAsOf.toISOString() });
  expect(s.snapshotRead.mock.calls[0]![0].observedThrough).toEqual(firstpubAsOf);
  expect(input.evidence.selectedEvidence.filter((item) => item.providerKey === "github-trending-page")).toHaveLength(10);
  expect(s.supplementalRead).not.toHaveBeenCalled(); // Canonical snapshot already includes the complete board.
  expect(s.github.read.mock.calls[0]![0].observedThrough).toEqual(firstpubAsOf);
  const artifact = s.artifacts.all()[0]!.toSnapshot();
  expect(artifact.generatedAt!.getTime()).toBeGreaterThanOrEqual(firstpubAsOf.getTime());
  expect(artifact.sourceWindow.ingestionCutoff).toEqual(firstpubAsOf);
  expect(artifact.qualityFlags).toContain("partial_evidence");
  expect(artifact.risksAndUnknowns.some((risk) => risk.description.includes("not been proven complete"))).toBe(true);
  expect(s.publish).toHaveBeenCalledTimes(1);
  expect(s.publish.mock.calls[0]![0].githubProjectionAudit).toMatchObject({ status: "verified",
    observedThrough: firstpubAsOf.toISOString(), telemetry: { qualitySignal: "github_projection_collection_delay_warning" } });
  expect(s.inventory.db.claims.slots).toBe(1);
});

it("ordinary LIVE admission still rejects a caller's completed-day Date without provider effects", async () => {
  const s = await scenario();
  const result = await new ExecuteReaderSummaryJobUseCase(...s.dependencies.slice(0, 20) as ConstructorParameters<typeof ExecuteReaderSummaryJobUseCase>)
    .execute({ ...s.command, observedThrough: firstpubAsOf });
  expect(result.ok).toBe(false); expect(s.claim).not.toHaveBeenCalled(); expect(s.generate).not.toHaveBeenCalled();
});

it.each(["requested", "running"] as const)("generic polling cannot run a %s first-publication job without manifest authority", async (status) => {
  const s = await scenario(); s.dependencies[20] = undefined;
  if (status === "running") {
    const job = (await s.jobs.findById(s.command))!.toSnapshot();
    await s.jobs.save(ReaderSummaryJob.rehydrate({ ...job, status, startedAt: firstpubAsOf }));
    s.inventory.advance(3600_000);
  }
  const result = await new ExecuteReaderSummaryJobUseCase(...s.dependencies).execute(s.command);
  expect(result.ok).toBe(false); expect(s.claim).not.toHaveBeenCalled(); expect(s.select).not.toHaveBeenCalled();
  expect(s.generate).not.toHaveBeenCalled();
});

it("provider failure remains terminal-consumed with no automatic retry or manifest escape", async () => {
  const s = await scenario();
  s.generate.mockImplementation(async () => { throw new Error("Synthetic provider uncertain effect"); });
  const result = await s.execute.execute(s.command); expect(result.ok).toBe(false);
  const failed = await s.jobs.findById(s.command);
  expect(failed!.toSnapshot()).toMatchObject({ status: "failed", terminalFailureCode: "provider_execution_failed" });
  expect((await s.execute.execute(s.command)).ok).toBe(false);
  expect(s.generate).toHaveBeenCalledTimes(1); expect(s.publish).not.toHaveBeenCalled();
  await expect(s.inventory.operation().reserve()).rejects.toThrow("already claimed");
});

it("two simultaneous day reservations permit one complete real selector/model/publication pipeline", async () => {
  const inventory = await firstpubFixture();
  const one = await scenario(inventory, false), two = await scenario(inventory, false);
  const run = async (s: Awaited<ReturnType<typeof scenario>>) => {
    await s.op.reserve();
    expect(inventory.db.claims.slots).toBe(1);
    return s.execute.execute(s.command);
  };
  const results = await Promise.allSettled([run(one), run(two)]);
  const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof run>>> => r.status === "fulfilled");
  expect(fulfilled).toHaveLength(1);
  expect(fulfilled[0]!.value).toMatchObject({ ok: true, value: { status: "completed" } });
  expect(one.generate.mock.calls.length + two.generate.mock.calls.length).toBe(1);
  expect(one.publish.mock.calls.length + two.publish.mock.calls.length).toBe(1);
  expect(inventory.db.claims.slots).toBe(1);
});

it("does not publish a diagnostic no-signal artifact when first-publication selection has no assessed evidence", async () => {
  const s = await scenario();
  const feed = new InMemoryFeedItemReadRepository();
  const empty = new RelevanceReaderSummaryEvidenceSelector(new RankFeedItemsUseCase(feed,
    new InMemoryUserRelevanceProfileRepository(), s.inventory.clock), feed, s.inventory.clock);
  s.dependencies[3] = new DatasetGuardedReaderSummaryEvidenceSelector(empty, s.op.guard);
  const result = await new ExecuteReaderSummaryJobUseCase(...s.dependencies).execute(s.command);
  expect(result.ok).toBe(false);
  expect(s.generate).not.toHaveBeenCalled(); expect(s.publish).not.toHaveBeenCalled();
  expect(s.artifacts.all()).toHaveLength(0);
  expect((await s.jobs.findById(s.command))!.toSnapshot()).toMatchObject({ status: "failed", terminalFailureCode: "provider_execution_failed" });
  expect(s.inventory.db.claims.slots).toBe(1);
});
