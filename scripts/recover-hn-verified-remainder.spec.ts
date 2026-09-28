import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HackerNewsClientPort, HackerNewsListing, HackerNewsSearchOptions, HackerNewsStory } from
  "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-client.port";
import { ScanAttempt } from "@social-monitor/ingestion/domain";
import {
  FakeConversationProjection, FakeFeedProjection, FakeScanAttemptRepository,
  FakeScanLease, FakeSourceItemRepository, SequenceIdGenerator,
} from "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case.spec-support";
import type { ScanAttemptRepositoryPort } from "@social-monitor/ingestion/ports";
import { FixedClock, type TenantId, type WorkspaceId } from "@social-monitor/shared-kernel";

import { recoverHnPublicHistoricalDay } from "./recover-hn-public-historical-day";
import { importVerifiedHnRemainder, planVerifiedHnRemainder, planVerifiedHnRemainderFromFiles,
  verifiedHnPlanReceipt,
  type PinnedDayArtifact, type VerifiedHnImportDependencies, type VerifiedHnImportScope } from
  "./recover-hn-verified-remainder";

const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const journalName = "hn-verified-remainder-2026-09-20_27.journal.json";

class FakeClient implements HackerNewsClientPort {
  constructor(private readonly repeatIds = false, private readonly commentRootDay?: string) {}
  async searchStories(query: string, _limit: number, options?: HackerNewsSearchOptions): Promise<readonly HackerNewsStory[]> {
    const index = Number(/^term-(\d+)$/u.exec(query)?.[1] ?? 0);
    const count = index === 1 ? 3 : 1;
    const dayOffset = this.repeatIds ? 0 : (options!.from!.getUTCDate() - 20) * 1_000;
    return Array.from({ length: count }, (_, offset) => ({ id: dayOffset + index * 10 + offset + 1,
      title: `Synthetic story ${index}-${offset}`, time: Math.floor(options!.from!.getTime() / 1000) + index + 1,
      kind: "story" as const }));
  }
  async searchComments(_query: string, _limit: number, options?: HackerNewsSearchOptions): Promise<readonly HackerNewsStory[]> {
    if (this.commentRootDay === undefined) throw new Error("unexpected comment search");
    return [{ id: 90_001, kind: "comment", storyId: 99_999, parentId: 99_999,
      text: "A synthetic comment", time: Math.floor(options!.from!.getTime() / 1000) + 60 }];
  }
  async getStory(id: number): Promise<HackerNewsStory | null> {
    if (this.commentRootDay === undefined || id !== 99_999) throw new Error("unexpected story lookup");
    return { id, kind: "story", title: "Comment-only root", time: Math.floor(Date.parse(`${this.commentRootDay}T12:00:00.000Z`) / 1000) };
  }
  async listStoryComments(): Promise<readonly HackerNewsStory[]> { throw new Error("unexpected comment expansion"); }
  async listStories(_listing: HackerNewsListing): Promise<readonly HackerNewsStory[]> { throw new Error("live listing forbidden"); }
}

describe("verified HN remainder planner", () => {
  const roots: string[] = [];
  afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

  async function fixture(day = "2026-09-20", repeatIds = false, commentRootDay?: string) {
    const root = await mkdtemp(join(tmpdir(), "hn-verified-remainder-"));
    roots.push(root);
    const bindingPath = join(root, "binding.json");
    const outputDir = join(root, day);
    await writeFile(bindingPath, JSON.stringify([{ bindingId: "00000000-0000-4000-8000-000000000004", status: "ENABLED", config: {
      mode: "search", query: "base", maxItems: 100, scanPasses: Array.from({ length: 28 }, (_, index) => ({
        mode: "search", target: commentRootDay !== undefined && index === 27 ? "comment" : "story",
        query: `term-${index}`, maxItems: 2,
      })), maxItemAgeHours: 48,
    } }]));
    await recoverHnPublicHistoricalDay({ day, bindingsPath: bindingPath, outputDir,
      client: new FakeClient(repeatIds, commentRootDay) });
    const bindingBytes = await readFile(bindingPath);
    const artifact: PinnedDayArtifact = { day, manifestBytes: await readFile(join(outputDir, "manifest.json")),
      itemsBytes: await readFile(join(outputDir, "items.json")), expectedManifestSha256: sha(await readFile(join(outputDir, "manifest.json"))) };
    return { root, bindingPath, bindingBytes, expectedBindingSha256: sha(bindingBytes), artifact };
  }

  async function campaignFixture() {
    const fixtures = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      fixture(`2026-09-${String(index + 20)}`)));
    const first = fixtures[0]!;
    return { root: first.root, artifacts: { bindingBytes: first.bindingBytes,
      expectedBindingSha256: first.expectedBindingSha256, days: fixtures.map((entry) => entry.artifact) } };
  }

  function replaceManifest(artifact: PinnedDayArtifact, edit: (manifest: Record<string, unknown>) => void): PinnedDayArtifact {
    const manifest = JSON.parse(artifact.manifestBytes.toString()) as Record<string, unknown>;
    edit(manifest);
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    return { ...artifact, manifestBytes, expectedManifestSha256: sha(manifestBytes) };
  }

  const scope: VerifiedHnImportScope = { tenantId: "00000000-0000-4000-8000-000000000001" as TenantId,
    workspaceId: "00000000-0000-4000-8000-000000000002" as WorkspaceId,
    interestId: "00000000-0000-4000-8000-000000000003",
    sourceBindingId: "00000000-0000-4000-8000-000000000004",
    scanPolicyId: "00000000-0000-4000-8000-000000000005", correlationId: "synthetic-correlation" };

  function fakeExecution(calls: string[][], fail = false): VerifiedHnImportDependencies {
    const feed = new FakeFeedProjection();
    return {
      verifyCurrentBinding: async () => true,
      findExistingExternalIds: async () => [],
      sourceItems: new FakeSourceItemRepository(),
      feedProjection: {
        project: async (command) => {
          calls.push(command.sourceItems.map((item) => item.toSnapshot().externalId));
          if (fail) throw new Error("synthetic projection failure");
          return feed.project(command);
        },
      },
      conversationProjection: new FakeConversationProjection(),
      scanAttempts: new FakeScanAttemptRepository(),
      scanLeases: new FakeScanLease(),
      ids: new SequenceIdGenerator(),
      clock: new FixedClock(new Date("2026-09-28T00:00:00.000Z")),
    };
  }

  // Regression: a changed items payload must invalidate the manifest's exact byte SHA.
  it("rejects tampered items SHA", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture();
    expect(() => planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256,
      days: [{ ...artifact, itemsBytes: Buffer.concat([artifact.itemsBytes, Buffer.from(" ")]) }] })).toThrow("items SHA-256 mismatch");
  });

  // Regression: the manifest itself must match an independently supplied immutable pin.
  it("rejects a manifest byte change before considering its claims", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture();
    expect(() => planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256,
      days: [{ ...artifact, manifestBytes: Buffer.concat([artifact.manifestBytes, Buffer.from(" ")]) }] }))
      .toThrow("manifest SHA-256 mismatch");
  });

  // Regression: duplicate JSON keys can hide a second manifest claim from reviewers and must fail closed.
  it("rejects repinned manifest JSON with duplicate keys", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture();
    const manifestBytes = Buffer.from(artifact.manifestBytes.toString().replace(
      '"status": "incomplete",', '"status": "incomplete",\n  "status": "incomplete",'));
    expect(() => planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256,
      days: [{ ...artifact, manifestBytes, expectedManifestSha256: sha(manifestBytes) }] }))
      .toThrow("not exact exporter JSON");
  });

  // Regression: an ID returned solely by a capped incomplete pass must never become eligible.
  it("keeps incomplete-pass-only IDs out of the plan and reports partial coverage", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture();
    const plan = planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [artifact] });
    expect(plan.coverage).toBe("PARTIAL_SOURCE_ONLY");
    expect(plan.days[0]).toMatchObject({ aggregateStatus: "incomplete", completePasses: 27, incompletePasses: 1 });
    expect(plan.candidates.some((candidate) => candidate.externalId === "hn:11")).toBe(false);
    expect(plan.candidates).toHaveLength(27);
    expect(plan.candidates[0]?.provenance).toEqual([27]);
    expect(plan.planSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  // Regression: a manifest for the wrong binding or UTC day must not lend its pass proof.
  it("rejects wrong binding and day even when the altered manifest is repinned", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture();
    for (const changed of [replaceManifest(artifact, (manifest) => { manifest.bindingId = "other"; }),
      replaceManifest(artifact, (manifest) => { manifest.day = "2026-09-21"; })]) {
      expect(() => planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [changed] }))
        .toThrow("binding/day/coverage mismatch");
    }
  });

  // Regression: duplicate candidate rows and IDs crossing days cannot yield ambiguous source identity.
  it("rejects duplicate candidate and cross-day candidate ID", async () => {
    const first = await fixture();
    const payload = JSON.parse(first.artifact.itemsBytes.toString()) as { candidateItems: unknown[]; candidateIds: string[] };
    payload.candidateItems.push(payload.candidateItems[0]);
    payload.candidateIds.push(payload.candidateIds[0]!);
    const itemsBytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
    const altered = replaceManifest(first.artifact, (manifest) => { manifest.itemsSha256 = sha(itemsBytes);
      manifest.uniqueCandidateCount = payload.candidateItems.length; });
    expect(() => planVerifiedHnRemainder({ bindingBytes: first.bindingBytes, expectedBindingSha256: first.expectedBindingSha256,
      days: [{ ...altered, itemsBytes }] })).toThrow("duplicate candidate");
    const second = await fixture("2026-09-21", true);
    expect(() => planVerifiedHnRemainder({ bindingBytes: first.bindingBytes, expectedBindingSha256: first.expectedBindingSha256,
      days: [first.artifact, second.artifact] })).toThrow("Cross-day duplicate candidate");
  });

  // Regression: an aggregate with incomplete passes cannot be promoted to complete by changing a label.
  it("rejects a partial source falsely declared complete", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture();
    const altered = replaceManifest(artifact, (manifest) => { manifest.status = "complete"; });
    expect(() => planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [altered] }))
      .toThrow("binding/day/coverage mismatch");
  });

  // Regression: unknown artifact fields and an item attributed to no actual pass must fail closed.
  it("rejects unknown fields and false exact-pass item provenance", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture();
    const unknown = replaceManifest(artifact, (manifest) => { manifest.unexpected = true; });
    expect(() => planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [unknown] })).toThrow("unknown fields");
    const payload = JSON.parse(artifact.itemsBytes.toString()) as {
      candidateItems: Array<{ externalId: string; metadata: { source: string } }>;
      items: Array<{ externalId: string; metadata: { source: string } }>;
    };
    const changedId = payload.candidateItems[0]!.externalId;
    payload.candidateItems[0]!.metadata.source = "not_an_adapter_source";
    payload.items.find((item) => item.externalId === changedId)!.metadata.source = "not_an_adapter_source";
    const itemsBytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
    const altered = replaceManifest(artifact, (manifest) => { manifest.itemsSha256 = sha(itemsBytes); });
    expect(() => planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [{ ...altered, itemsBytes }] }))
      .toThrow("no exact pass provenance");
  });

  // Regression: a repinned payload with a non-string external URL is not normalized HN adapter output.
  it("rejects a malformed known item metadata field", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture();
    const payload = JSON.parse(artifact.itemsBytes.toString()) as {
      candidateItems: Array<{ metadata: { externalUrl?: unknown } }>;
      items: Array<{ metadata: { externalUrl?: unknown } }>;
    };
    payload.candidateItems[0]!.metadata.externalUrl = 42;
    payload.items[0]!.metadata.externalUrl = 42;
    const itemsBytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
    const altered = replaceManifest(artifact, (manifest) => { manifest.itemsSha256 = sha(itemsBytes); });
    expect(() => planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [{ ...altered, itemsBytes }] }))
      .toThrow("not normalized HN adapter output");
  });

  // Regression: an item from a story pass on a different UTC day cannot borrow this day's complete pass.
  it("rejects a story item stamped for another day", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture();
    const payload = JSON.parse(artifact.itemsBytes.toString()) as {
      candidateItems: Array<{ externalId: string; publishedAt: string; publishedAtUnixSeconds: number }>;
      items: Array<{ externalId: string; publishedAt: string; publishedAtUnixSeconds: number }>;
    };
    for (const item of [...payload.candidateItems, ...payload.items]) {
      item.publishedAtUnixSeconds -= 86_400;
      item.publishedAt = new Date(item.publishedAtUnixSeconds * 1000).toISOString();
    }
    const itemsBytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
    const altered = replaceManifest(artifact, (manifest) => { manifest.itemsSha256 = sha(itemsBytes); });
    expect(() => planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [{ ...altered, itemsBytes }] }))
      .toThrow("story pass item is outside its UTC day");
  });

  // Regression: a complete comment pass can return a previous-day root, which must stay out of this day's import.
  it("excludes an out-of-day comment root while retaining complete-pass story candidates", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture("2026-09-20", false, "2026-09-19");
    const plan = planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [artifact] });
    expect(plan.days[0]).toMatchObject({ excludedOutOfDay: 1, verifiedCandidates: 26,
      aggregateStatus: "incomplete", completePasses: 27 });
    expect(plan.candidates.some((candidate) => candidate.externalId === "hn:99999")).toBe(false);
  });

  // Regression: legacy comment-pass root IDs do not prove an independently fetched story.
  it("excludes a same-day root seen only in a complete comment pass", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture("2026-09-20", false, "2026-09-20");
    const plan = planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [artifact] });
    expect(plan.candidates.some((candidate) => candidate.externalId === "hn:99999")).toBe(false);
    expect(plan.days[0]).toMatchObject({ excludedUnverifiableComment: 1, verifiedCandidates: 26 });
  });

  // Regression: a repinned comment whose metadata names another story is not authentic adapter output.
  it("rejects inconsistent normalized comment metadata", async () => {
    const { bindingBytes, expectedBindingSha256, artifact } = await fixture("2026-09-20", false, "2026-09-19");
    const payload = JSON.parse(artifact.itemsBytes.toString()) as {
      comments: Array<{ metadata: { storyId: number } }>;
    };
    payload.comments[0]!.metadata.storyId = 1;
    const itemsBytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
    const altered = replaceManifest(artifact, (manifest) => { manifest.itemsSha256 = sha(itemsBytes); });
    expect(() => planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [{ ...altered, itemsBytes }] }))
      .toThrow("not HN comment output");
  });

  // Regression: read-only CLI inputs must use independently pinned manifest and binding bytes.
  it("reads explicit pinned files and emits the same deterministic plan", async () => {
    const { root, bindingPath, bindingBytes, expectedBindingSha256, artifact } = await fixture();
    const pinsPath = join(root, "pins.json");
    await writeFile(pinsPath, JSON.stringify({ schemaVersion: 1, bindingSha256: expectedBindingSha256,
      days: [{ day: artifact.day, directory: join(root, artifact.day), manifestSha256: artifact.expectedManifestSha256 }] }));
    const fromFiles = await planVerifiedHnRemainderFromFiles(bindingPath, pinsPath);
    expect(fromFiles).toEqual(planVerifiedHnRemainder({ bindingBytes, expectedBindingSha256, days: [artifact] }));
    const receipt = JSON.stringify(verifiedHnPlanReceipt(fromFiles));
    expect(receipt).not.toContain("Synthetic story");
    expect(receipt).not.toContain("candidateItems");
    expect(verifiedHnPlanReceipt(fromFiles)).toMatchObject({ candidateCount: fromFiles.candidates.length,
      planSha256: fromFiles.planSha256, coverage: "PARTIAL_SOURCE_ONLY" });
  });

  // Regression: an unpinned opt-in plan must never reserve a journal or reach the scan path.
  it("requires the exact plan hash before any import effect", async () => {
    const { root, bindingBytes, expectedBindingSha256, artifact } = await fixture();
    const calls: string[][] = [];
    const journalPath = join(root, journalName);
    await expect(importVerifiedHnRemainder({ artifacts: { bindingBytes, expectedBindingSha256, days: [artifact] },
      expectedPlanSha256: "0".repeat(64), journalPath, scope, dependencies: fakeExecution(calls) }))
      .rejects.toThrow("opt-in plan SHA-256 mismatch");
    expect(calls).toHaveLength(0);
    await expect(readFile(journalPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  // Regression: importing a subset would consume the one-shot campaign journal before all days are considered.
  it("rejects a partial campaign before journal reservation", async () => {
    const { root, bindingBytes, expectedBindingSha256, artifact } = await fixture();
    const artifacts = { bindingBytes, expectedBindingSha256, days: [artifact] };
    const plan = planVerifiedHnRemainder(artifacts);
    const journalPath = join(root, journalName);
    await expect(importVerifiedHnRemainder({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath, scope, dependencies: fakeExecution([]) })).rejects.toThrow("all eight pinned");
    await expect(readFile(journalPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  // Regression: a completed exact-artifact journal must block repeat import of the same campaign.
  it("imports only currently absent verified IDs through the scan seam and rejects repeat", async () => {
    const { root, artifacts } = await campaignFixture();
    const plan = planVerifiedHnRemainder(artifacts);
    const journalPath = join(root, journalName);
    const calls: string[][] = [];
    const result = await importVerifiedHnRemainder({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath, scope, dependencies: fakeExecution(calls) });
    expect(result).toEqual({ planSha256: plan.planSha256, inserted: 216, alreadyPresent: 0 });
    expect(calls).toHaveLength(8);
    expect(calls.every((batch) => batch.length === 27)).toBe(true);
    expect(calls.flat()).not.toContain("hn:11");
    expect(JSON.parse(await readFile(journalPath, "utf8"))).toMatchObject({ status: "complete",
      planSha256: plan.planSha256, inserted: 216 });
    await expect(importVerifiedHnRemainder({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath, scope, dependencies: fakeExecution(calls) })).rejects.toThrow("Repeat or uncertain");
    expect(calls).toHaveLength(8);
  });

  // Regression: the opt-in seam must persist source items and invoke feed and conversation projections through ExecuteScanUseCase.
  it("runs the genuine scan use case with disposable source and projection ports", async () => {
    const { root, artifacts } = await campaignFixture();
    const plan = planVerifiedHnRemainder(artifacts);
    const repository = new FakeSourceItemRepository();
    const feed = new FakeFeedProjection();
    const conversation = new FakeConversationProjection();
    const attempts = new FakeScanAttemptRepository();
    const leases = new FakeScanLease();
    const result = await importVerifiedHnRemainder({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath: join(root, journalName), scope, dependencies: {
        ...fakeExecution([]), sourceItems: repository, feedProjection: feed,
        conversationProjection: conversation, scanAttempts: attempts, scanLeases: leases,
      } });
    expect(result.inserted).toBe(216);
    expect(repository.all()).toHaveLength(216);
    expect(feed.commands).toHaveLength(8);
    expect(conversation.commands).toHaveLength(8);
    expect(conversation.commands.every((command) => command.conversationUnits.length === 0)).toBe(true);
    expect(leases.released).toHaveLength(8);
  });

  // Regression: concurrent operators sharing the campaign journal must not execute two scan batches.
  it("allows only one concurrent reservation of the one-shot journal", async () => {
    const { root, artifacts } = await campaignFixture();
    const plan = planVerifiedHnRemainder(artifacts);
    const journalPath = join(root, journalName);
    const calls: string[][] = [];
    const request = { artifacts, expectedPlanSha256: plan.planSha256,
      journalPath, scope, dependencies: fakeExecution(calls) };
    const outcomes = await Promise.allSettled([
      importVerifiedHnRemainder(request), importVerifiedHnRemainder(request),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(calls).toHaveLength(8);
  });

  // Regression: failure after scan entry leaves an uncertain one-shot journal and blocks automatic retry.
  it("rejects an uncertain journal after a failed projection", async () => {
    const { root, artifacts } = await campaignFixture();
    const plan = planVerifiedHnRemainder(artifacts);
    const journalPath = join(root, journalName);
    const calls: string[][] = [];
    await expect(importVerifiedHnRemainder({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath, scope, dependencies: fakeExecution(calls, true) })).rejects.toThrow("uncertain");
    expect(JSON.parse(await readFile(journalPath, "utf8"))).toMatchObject({ status: "started",
      planSha256: plan.planSha256 });
    await expect(importVerifiedHnRemainder({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath, scope, dependencies: fakeExecution(calls) })).rejects.toThrow("Repeat or uncertain");
    expect(calls).toHaveLength(1);
  });

  // Regression: a replayed scan-attempt result cannot falsely prove this one-shot fetch ran.
  it("refuses a stale successful scan result that never consumed verified items", async () => {
    const { root, artifacts } = await campaignFixture();
    const plan = planVerifiedHnRemainder(artifacts);
    const journalPath = join(root, journalName);
    const staleAttempts: ScanAttemptRepositoryPort = {
      save: async () => undefined,
      findByScanJob: async (query) => ScanAttempt.start({ scanJobId: query.scanJobId,
        tenantId: query.tenantId, workspaceId: query.workspaceId, sourceBindingId: scope.sourceBindingId,
        attemptNumber: 1, startedAt: new Date("2026-09-28T00:00:00.000Z") }).succeed({
        finishedAt: new Date("2026-09-28T00:00:00.000Z"), fetched: 27,
        inserted: 27, skippedDuplicates: 0, projected: 27,
      }),
    };
    const dependencies: VerifiedHnImportDependencies = { ...fakeExecution([]), scanAttempts: staleAttempts };
    await expect(importVerifiedHnRemainder({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath, scope, dependencies })).rejects.toThrow("uncertain");
    expect(JSON.parse(await readFile(journalPath, "utf8"))).toMatchObject({ status: "started" });
  });

  // Regression: stale binding scope must stop before an item enters the scan path.
  it("refuses a live binding mismatch and leaves the journal uncertain", async () => {
    const { root, artifacts } = await campaignFixture();
    const plan = planVerifiedHnRemainder(artifacts);
    const journalPath = join(root, journalName);
    const calls: string[][] = [];
    await expect(importVerifiedHnRemainder({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath, scope, dependencies: { ...fakeExecution(calls), verifyCurrentBinding: async () => false } }))
      .rejects.toThrow("Current scoped binding");
    expect(calls).toHaveLength(0);
    expect(JSON.parse(await readFile(journalPath, "utf8"))).toMatchObject({ status: "started" });
  });

  // Regression: the current scoped absence check must keep already persisted IDs out of the replay batch.
  it("skips IDs currently present in the scoped repository", async () => {
    const { root, artifacts } = await campaignFixture();
    const plan = planVerifiedHnRemainder(artifacts);
    const journalPath = join(root, journalName);
    const calls: string[][] = [];
    const existing = plan.candidates[0]!.externalId;
    const result = await importVerifiedHnRemainder({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath, scope, dependencies: { ...fakeExecution(calls), findExistingExternalIds: async () => [existing] } });
    expect(result).toMatchObject({ inserted: 215, alreadyPresent: 1 });
    expect(calls[0]).not.toContain(existing);
  });

  // Regression: a source item appearing after the absence snapshot must prevent a false complete journal.
  it("leaves an uncertain journal when persistence finds a concurrent duplicate", async () => {
    const { root, artifacts } = await campaignFixture();
    const plan = planVerifiedHnRemainder(artifacts);
    const journalPath = join(root, journalName);
    const repository = new FakeSourceItemRepository();
    let seeded = false;
    const dependencies: VerifiedHnImportDependencies = { ...fakeExecution([]), sourceItems: {
      saveBatch: async (command) => {
        if (!seeded) {
          seeded = true;
          await repository.saveBatch({ ...command, items: command.items.slice(0, 1) });
        }
        return repository.saveBatch(command);
      },
    } };
    await expect(importVerifiedHnRemainder({ artifacts, expectedPlanSha256: plan.planSha256,
      journalPath, scope, dependencies })).rejects.toThrow("uncertain");
    expect(JSON.parse(await readFile(journalPath, "utf8"))).toMatchObject({ status: "started" });
    expect(repository.all()).toHaveLength(27);
  });
});
