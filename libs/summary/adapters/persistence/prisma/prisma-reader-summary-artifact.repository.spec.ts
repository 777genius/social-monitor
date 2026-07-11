import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryArtifact } from "../../../domain";
import { emptyReaderSummaryReliabilityReport } from "../../../domain/entities/reader-summary-reliability";
import { PrismaReaderSummaryArtifactRepository } from "./prisma-reader-summary-artifact.repository";
import type { PrismaReaderSummaryArtifactRecord } from "./prisma-reader-summary-records";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaSummaryStatus } from "./prisma-summary-records";

describe("PrismaReaderSummaryArtifactRepository", () => {
  it("keeps no-signal reader summaries out of user-facing lists and periods", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    await repository.save(readerSummaryArtifact("reader-summary-completed"));
    await repository.save(
      noSignalReaderSummaryArtifact("reader-summary-empty"),
    );

    const list = await repository.list({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      cadence: "daily",
      periodStartedAt: period.startedAt,
      periodEndedAt: period.endedAt,
      timezone: period.timezone,
      limit: 10,
    });
    const periods = await repository.listPeriodSummaries({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      cadence: "daily",
      periodStartedAt: period.startedAt,
      periodEndedAt: period.endedAt,
      timezone: period.timezone,
      limit: 10,
    });

    expect(list.items.map((item) => item.toSnapshot().readerSummaryId)).toEqual(
      ["reader-summary-completed"],
    );
    expect(periods.items.map((item) => item.readerSummaryId)).toEqual([
      "reader-summary-completed",
    ]);
    expect(prisma.statusFor("reader-summary-completed")).toBe("COMPLETED");
    expect(prisma.statusFor("reader-summary-empty")).toBe("NO_SIGNAL");
  });

  it("does not republish an older artifact when its save is replayed", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    const older = readerSummaryArtifact("reader-summary-older");
    const newer = readerSummaryArtifact("reader-summary-newer");

    await repository.save(older);
    await repository.save(newer);
    await repository.save(older);

    expect(prisma.statusFor("reader-summary-older")).toBe("SUPERSEDED");
    expect(prisma.statusFor("reader-summary-newer")).toBe("COMPLETED");
  });

  it("does not let deterministic output supersede subscription runtime output", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    await repository.save(
      readerSummaryArtifact("reader-summary-runtime", "codex:gpt-5.5:xhigh"),
    );
    await repository.save(
      readerSummaryArtifact(
        "reader-summary-deterministic",
        "deterministic-reader-summary-v1",
      ),
    );

    expect(prisma.statusFor("reader-summary-runtime")).toBe("COMPLETED");
    expect(prisma.statusFor("reader-summary-deterministic")).toBe("SUPERSEDED");
  });

  it("keeps the newer requested generation visible when an older run finishes last", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    await repository.save(readerSummaryArtifact("reader-summary-newer"), {
      generationRequestedAt: new Date("2026-07-09T10:05:00.000Z"),
    });
    await repository.save(readerSummaryArtifact("reader-summary-older"), {
      generationRequestedAt: new Date("2026-07-09T10:00:00.000Z"),
    });

    expect(prisma.statusFor("reader-summary-newer")).toBe("COMPLETED");
    expect(prisma.statusFor("reader-summary-older")).toBe("SUPERSEDED");
  });

  it("publishes a newer requested generation after an older run", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    await repository.save(readerSummaryArtifact("reader-summary-older"), {
      generationRequestedAt: new Date("2026-07-09T10:00:00.000Z"),
    });
    await repository.save(readerSummaryArtifact("reader-summary-newer"), {
      generationRequestedAt: new Date("2026-07-09T10:05:00.000Z"),
    });

    expect(prisma.statusFor("reader-summary-older")).toBe("SUPERSEDED");
    expect(prisma.statusFor("reader-summary-newer")).toBe("COMPLETED");
  });
});

const tenant = tenantId("tenant-reader-summary-prisma");
const workspace = workspaceId("workspace-reader-summary-prisma");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-07-05T00:00:00.000Z"),
  endedAt: new Date("2026-07-06T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
};

const readerSummaryArtifact = (
  readerSummaryId: string,
  modelVersion = "deterministic-local.v1",
): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period,
    sourceWindow: {
      windowId: "reader-window",
      startedAt: new Date("2026-07-05T08:00:00.000Z"),
      endedAt: new Date("2026-07-05T09:00:00.000Z"),
      selectedFeedItemIds: ["feed-1"],
      storyClusterIds: ["story-1"],
    },
    storyClusters: [
      {
        id: "story-1",
        storyKey: "url:example.test/story",
        representativeFeedItemId: "feed-1",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["rss"],
        score: 1.2,
        observedAtRange: {
          startedAt: new Date("2026-07-05T08:00:00.000Z"),
          endedAt: new Date("2026-07-05T09:00:00.000Z"),
        },
        whyImportant: ["Relevant source item."],
      },
    ],
    contextArtifacts: [],
    headline: "Reader source signal",
    executiveSummary: "A reader source signal was selected.",
    content: {
      headline: "Reader source signal",
      oneLineTakeaway: "A reader source signal was selected.",
      bullets: ["A cited source item is relevant."],
      mainTopics: ["AI"],
      qualityState: {
        status: "ready",
        flags: [],
        warnings: [],
        isSingleSource: true,
      },
      interestSections: [],
      sourceMix: [
        {
          providerKey: "rss",
          itemCount: 1,
          citationCount: 1,
          storyClusterCount: 1,
          crossSourceClusterCount: 0,
          singleSourceOnly: true,
          interestIds: ["interest-ai"],
        },
      ],
      topReads: [topRead()],
      selectedPosts: [topRead()],
      claimBoard: [],
      reliabilityReport: emptyReaderSummaryReliabilityReport(),
      trendDelta: {
        newSignals: ["1 RSS item selected"],
        growingSignals: [],
        repeatedSignals: [],
        fadingSignals: [],
      },
      risks: [],
      openQuestions: ["Is there confirming source evidence?"],
      nextActions: [],
    },
    topStories: [
      {
        storyClusterId: "story-1",
        title: "Reader source signal",
        summary: "A cited source item is relevant.",
        interestIds: ["interest-ai"],
        providerKeys: ["rss"],
        citationIds: ["citation-1"],
      },
    ],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [
      {
        citationId: "citation-1",
        feedItemId: "feed-1",
        sourceItemId: "source-1",
        providerKey: "rss",
        field: "bodyPreview",
        canonicalUrl: "https://example.test/story",
      },
    ],
    qualityFlags: [],
    confidence: {
      level: "high",
      score: 0.9,
      rationale: "The source item is cited.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion,
      providerVersion: "local",
      rulesVersion: "reader-summary.rules.v1",
      evalDatasetVersion: "reader-summary.eval.v1",
    },
    usage: {
      inputTokens: 100,
      outputTokens: 40,
      estimatedCostUsd: 0,
    },
  });

const noSignalReaderSummaryArtifact = (
  readerSummaryId: string,
): ReaderSummaryArtifact => {
  const snapshot = readerSummaryArtifact(readerSummaryId).toSnapshot();

  return ReaderSummaryArtifact.create({
    ...snapshot,
    sourceWindow: {
      ...snapshot.sourceWindow,
      selectedFeedItemIds: [],
      storyClusterIds: [],
    },
    storyClusters: [],
    headline: "No reliable reader signal",
    executiveSummary: "No eligible evidence items were selected.",
    content: {
      ...snapshot.content!,
      headline: "No reliable reader signal",
      oneLineTakeaway: "No eligible evidence items were selected.",
      bullets: [],
      mainTopics: [],
      qualityState: {
        status: "no_signal",
        flags: ["no_signal", "limited_sources"],
        warnings: ["No eligible evidence items were selected."],
        isSingleSource: true,
      },
      sourceMix: [],
      topReads: [],
      selectedPosts: [],
      claimBoard: [],
      risks: [],
      openQuestions: [],
      nextActions: [],
    },
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [],
    qualityFlags: ["no_signal", "limited_sources"],
    confidence: {
      level: "none",
      score: 0,
      rationale: "No eligible evidence items were selected.",
    },
    noSignalReason: "No eligible evidence items were selected.",
  });
};

const topRead = () => ({
  storyClusterId: "story-1",
  title: "Reader source signal",
  providerKey: "rss",
  providerName: "RSS",
  primaryActionKind: "read_source" as const,
  reason: "It is relevant to the monitored topic.",
  matchedInterestIds: ["interest-ai"],
  matchedRules: ["ai"],
  signalScore: 1.2,
  confidence: {
    level: "medium" as const,
    score: 0.64,
    rationale: "The source item is cited.",
  },
  confirmedProviderKeys: ["rss"],
  providerMetrics: [],
  whyImportant: ["Relevant source item."],
  whyNow: "It appeared in the current summary window.",
  canonicalUrl: "https://example.test/story",
  citationIds: ["citation-1"],
  previewMedia: undefined,
});

class FakeReaderSummaryPrisma {
  private readonly records = new Map<
    string,
    PrismaReaderSummaryArtifactRecord
  >();
  private nowMs = Date.parse("2026-07-05T10:00:00.000Z");

  readonly client = {
    readerSummaryArtifact: {
      upsert: async (args: {
        readonly where: { readonly id: string };
        readonly update: Partial<PrismaReaderSummaryArtifactRecord>;
        readonly create: Omit<
          PrismaReaderSummaryArtifactRecord,
          "createdAt" | "updatedAt"
        >;
      }) => {
        const now = this.nextDate();
        const current = this.records.get(args.where.id);
        const record =
          current === undefined
            ? { ...args.create, createdAt: now, updatedAt: now }
            : { ...current, ...args.update, updatedAt: now };
        this.records.set(args.where.id, record);
        return record;
      },
      updateMany: async (args: {
        readonly where: ReaderSummaryArtifactWhere;
        readonly data: Partial<PrismaReaderSummaryArtifactRecord>;
      }) => {
        let count = 0;
        for (const record of this.records.values()) {
          if (matchesWhere(record, args.where)) {
            this.records.set(record.id, {
              ...record,
              ...args.data,
              updatedAt: this.nextDate(),
            });
            count += 1;
          }
        }
        return { count };
      },
      findMany: async (args: {
        readonly where: ReaderSummaryArtifactWhere;
        readonly skip?: number;
        readonly take?: number;
      }) => {
        const skip = args.skip ?? 0;
        const take = args.take ?? Number.POSITIVE_INFINITY;
        return [...this.records.values()]
          .filter((record) => matchesWhere(record, args.where))
          .sort(compareRecords)
          .slice(skip, skip + take);
      },
      count: async (args: { readonly where: ReaderSummaryArtifactWhere }) =>
        [...this.records.values()].filter((record) =>
          matchesWhere(record, args.where),
        ).length,
      findFirst: async (args: { readonly where: ReaderSummaryArtifactWhere }) =>
        [...this.records.values()]
          .filter((record) => matchesWhere(record, args.where))
          .sort(compareRecords)[0] ?? null,
    },
  } as unknown as PrismaSummaryClient;

  statusFor(id: string): PrismaSummaryStatus | undefined {
    return this.records.get(id)?.status;
  }

  private nextDate(): Date {
    this.nowMs += 1;
    return new Date(this.nowMs);
  }
}

type ReaderSummaryArtifactWhere = {
  readonly id?: { readonly not?: string } | string;
  readonly tenantId?: string;
  readonly workspaceId?: string;
  readonly scopeKey?: string;
  readonly cadence?: string;
  readonly periodStartedAt?: Date;
  readonly periodEndedAt?: Date;
  readonly periodTimezone?: string;
  readonly status?: { readonly in: readonly PrismaSummaryStatus[] };
};

const matchesWhere = (
  record: PrismaReaderSummaryArtifactRecord,
  where: ReaderSummaryArtifactWhere,
): boolean =>
  matchesId(record, where.id) &&
  matchesValue(record.tenantId, where.tenantId) &&
  matchesValue(record.workspaceId, where.workspaceId) &&
  matchesValue(record.scopeKey, where.scopeKey) &&
  matchesValue(record.cadence, where.cadence) &&
  matchesDate(record.periodStartedAt, where.periodStartedAt) &&
  matchesDate(record.periodEndedAt, where.periodEndedAt) &&
  matchesValue(record.periodTimezone, where.periodTimezone) &&
  (where.status === undefined || where.status.in.includes(record.status));

const matchesId = (
  record: PrismaReaderSummaryArtifactRecord,
  id: ReaderSummaryArtifactWhere["id"],
): boolean => {
  if (id === undefined) {
    return true;
  }
  if (typeof id === "string") {
    return record.id === id;
  }
  return id.not === undefined || record.id !== id.not;
};

const matchesValue = <T>(actual: T, expected: T | undefined): boolean =>
  expected === undefined || actual === expected;

const matchesDate = (actual: Date, expected: Date | undefined): boolean =>
  expected === undefined || actual.getTime() === expected.getTime();

const compareRecords = (
  left: PrismaReaderSummaryArtifactRecord,
  right: PrismaReaderSummaryArtifactRecord,
): number =>
  right.periodStartedAt.getTime() - left.periodStartedAt.getTime() ||
  right.createdAt.getTime() - left.createdAt.getTime() ||
  right.id.localeCompare(left.id);
