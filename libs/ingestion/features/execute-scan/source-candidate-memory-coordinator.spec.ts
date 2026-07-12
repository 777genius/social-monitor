import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  FetchedSourceItem,
  RememberSourceCandidatesCommand,
  ScreenSourceCandidatesCommand,
  ScreenSourceCandidatesResult,
  SourceCandidateMemoryPort,
  SourceCandidateMemoryRecord,
} from "../../ports";
import {
  rememberProcessedSourceCandidates,
  screenSourceCandidates,
} from "./source-candidate-memory-coordinator";

describe("source candidate memory coordinator", () => {
  it("classifies engagement changes without losing provider order", async () => {
    const memory = new TestMemory();
    const firstItems = [xItem("x:1", 4), xItem("x:2", 8)];
    const first = await screening(
      memory,
      firstItems,
      new Date("2026-07-10T13:00:00.000Z"),
    );
    await rememberProcessedSourceCandidates({
      memory,
      screening: first,
      processedExternalIds: new Set(firstItems.map((item) => item.externalId)),
      rememberedAt: new Date("2026-07-10T13:00:00.000Z"),
    });

    const replayItems = [
      xItem("x:1", 4),
      xItem("x:2", 10),
      xItem("x:3", 1),
    ];
    const replay = await screening(
      memory,
      replayItems,
      new Date("2026-07-10T13:15:00.000Z"),
    );

    expect(replay.classifications.map(({ kind }) => kind)).toEqual([
      "unchanged",
      "engagement_changed",
      "new",
    ]);
    expect(replay.itemsToEnrich.map(({ externalId }) => externalId)).toEqual([
      "x:3",
    ]);
    expect(
      replay.itemsForEngagementRefresh.map(({ externalId }) => externalId),
    ).toEqual(["x:2"]);
    expect(replay.itemsToProcess.map(({ externalId }) => externalId)).toEqual([
      "x:2",
      "x:3",
    ]);
    expect(replay.suppressedExternalIds).toEqual(["x:1"]);
    await rememberProcessedSourceCandidates({
      memory,
      screening: replay,
      processedExternalIds: new Set(["x:2", "x:3"]),
      rememberedAt: new Date("2026-07-10T13:15:00.000Z"),
    });
    const dueAfterChange = await screening(
      memory,
      [xItem("x:2", 10)],
      new Date("2026-07-10T13:30:00.000Z"),
    );
    expect(dueAfterChange.classifications[0]?.kind).toBe("observation_due");
  });

  it("makes expired engagement observable but refreshes expired RSS content", async () => {
    const engagementMemory = new TestMemory();
    const firstX = await screening(
      engagementMemory,
      [xItem("x:1", 4)],
      new Date("2026-07-10T13:00:00.000Z"),
    );
    await rememberProcessedSourceCandidates({
      memory: engagementMemory,
      screening: firstX,
      processedExternalIds: new Set(["x:1"]),
      rememberedAt: new Date("2026-07-10T13:00:00.000Z"),
    });
    const due = await screening(
      engagementMemory,
      [xItem("x:1", 4)],
      new Date("2026-07-10T13:30:00.000Z"),
    );

    const rssMemory = new TestMemory();
    const firstRss = await screening(
      rssMemory,
      [rssItem("rss:1")],
      new Date("2026-07-10T13:00:00.000Z"),
      "rss",
    );
    await rememberProcessedSourceCandidates({
      memory: rssMemory,
      screening: firstRss,
      processedExternalIds: new Set(["rss:1"]),
      rememberedAt: new Date("2026-07-10T13:00:00.000Z"),
    });
    const rssRefresh = await screening(
      rssMemory,
      [rssItem("rss:1")],
      new Date("2026-07-11T01:00:00.000Z"),
      "rss",
    );

    expect(due.classifications[0]?.kind).toBe("observation_due");
    expect(rssRefresh.classifications[0]?.kind).toBe("content_changed");
  });

  it("fails open in original order when memory read fails", async () => {
    const items = [xItem("x:1", 1), xItem("x:2", 2)];
    const result = await screening(
      {
        async screen() {
          throw new Error("private failure detail");
        },
        async remember() {},
      },
      items,
      new Date("2026-07-10T13:00:00.000Z"),
    );

    expect(result.warning).toBe("source_candidate_memory.read_failed");
    expect(result.classificationReliable).toBe(false);
    expect(result.classifications.map(({ kind }) => kind)).toEqual([
      "new",
      "new",
    ]);
    expect(result.itemsToProcess.map(({ externalId }) => externalId)).toEqual([
      "x:1",
      "x:2",
    ]);
  });
});

const screening = (
  memory: Parameters<typeof screenSourceCandidates>[0]["memory"],
  items: readonly FetchedSourceItem[],
  screenedAt: Date,
  providerKey = "x-twitter",
) =>
  screenSourceCandidates({
    memory,
    scope: {
      tenantId: tenantId("00000000-0000-4000-8000-000000000001"),
      workspaceId: workspaceId("00000000-0000-4000-8000-000000000002"),
      interestId: "00000000-0000-4000-8000-000000000003",
      sourceBindingId: "00000000-0000-4000-8000-000000000004",
      providerKey,
      interestQuery: "agents",
      sourceQuery: { mode: "search", query: "agents" },
    },
    items,
    screenedAt,
  });

const xItem = (externalId: string, likes: number): FetchedSourceItem => ({
  externalId,
  canonicalUrl: `https://x.com/example/status/${externalId}`,
  title: "Agent release",
  body: "Stable body",
  publishedAt: new Date("2026-07-10T12:00:00.000Z"),
  metadata: {
    kind: "x_post",
    likes,
    metrics: { likes },
  },
});

const rssItem = (externalId: string): FetchedSourceItem => ({
  externalId,
  canonicalUrl: `https://example.com/${externalId}`,
  title: "Agent release",
  body: "Stable body",
  publishedAt: new Date("2026-07-10T12:00:00.000Z"),
  metadata: { kind: "rss_item", feedUrl: "https://example.com/feed.xml" },
});

class TestMemory implements SourceCandidateMemoryPort {
  private readonly records = new Map<string, SourceCandidateMemoryRecord>();

  async screen(
    command: ScreenSourceCandidatesCommand,
  ): Promise<ScreenSourceCandidatesResult> {
    const records = command.candidates.flatMap((candidate) => {
      const record = this.records.get(candidate.externalId);
      return record === undefined ? [] : [record];
    });
    return {
      activeRecords: records.filter(
        (record) => record.expiresAt.getTime() > command.screenedAt.getTime(),
      ),
      suppressedExternalIds: [],
      records,
    };
  }

  async remember(command: RememberSourceCandidatesCommand): Promise<void> {
    for (const candidate of command.candidates) {
      const existing = this.records.get(candidate.externalId);
      this.records.set(candidate.externalId, {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: command.interestId,
        sourceBindingId: command.sourceBindingId,
        providerKey: command.providerKey,
        scopeFingerprint: command.scopeFingerprint,
        policyVersion: command.policyVersion,
        externalId: candidate.externalId,
        fingerprint: candidate.fingerprint,
        contentFingerprint: candidate.contentFingerprint,
        engagementFingerprint: candidate.engagementFingerprint ?? null,
        decision: candidate.decision,
        reasonCode: candidate.reasonCode,
        expiresAt: candidate.expiresAt,
        firstSeenAt: existing?.firstSeenAt ?? command.rememberedAt,
        lastSeenAt: command.rememberedAt,
        seenCount: (existing?.seenCount ?? 0) + 1,
        schemaVersion: 2,
      });
    }
  }
}
