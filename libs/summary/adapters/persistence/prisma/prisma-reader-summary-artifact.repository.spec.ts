import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  ReaderSummaryArtifact,
  type ReaderSummaryGitHubProjectionAudit,
} from "../../../domain";
import { emptyReaderSummaryReliabilityReport } from "../../../domain/entities/reader-summary-reliability";
import { PrismaReaderSummaryArtifactRepository } from "./prisma-reader-summary-artifact.repository";
import type { PrismaReaderSummaryArtifactRecord } from "./prisma-reader-summary-records";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaSummaryStatus } from "./prisma-summary-records";

describe("PrismaReaderSummaryArtifactRepository", () => {
  it("rejects a daily completed candidate without canonical GitHub proof but stages a genuine no-signal candidate", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    await repository.save(
      readerSummaryArtifact("reader-summary-completed"),
      noEligibleGitHubBindingOptions(),
    );
    await repository.save(
      noSignalReaderSummaryArtifact("reader-summary-empty"),
      noEligibleGitHubBindingOptions(),
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

    expect(list.items).toEqual([]);
    expect(periods.items).toEqual([]);
    expect(prisma.statusFor("reader-summary-completed")).toBe("REJECTED");
    expect(prisma.statusFor("reader-summary-empty")).toBe("RUNNING");
    await expect(
      repository.findById({
        tenantId: tenant,
        workspaceId: workspace,
        readerSummaryId: "reader-summary-completed",
      }),
    ).resolves.toBeNull();
  });

  it("persists failed-quality evidence as rejected without publishing it", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    await repository.save(readerSummaryArtifact("reader-summary-rejected"), {
      publicationDecision: rejectedDecision,
    });

    expect(prisma.statusFor("reader-summary-rejected")).toBe("REJECTED");
    await expect(
      repository.findById({
        tenantId: tenant,
        workspaceId: workspace,
        readerSummaryId: "reader-summary-rejected",
      }),
    ).resolves.toBeNull();
    await expect(
      repository.findRejectedDebugById({
        tenantId: tenant,
        workspaceId: workspace,
        readerSummaryId: "reader-summary-rejected",
      }),
    ).resolves.toMatchObject({ reasonCodes: ["editorial_quality"] });
  });

  it("rejects GitHub selectedPosts without an exact verified audit", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    await repository.save(
      githubReaderSummaryArtifact("reader-summary-unverified-github"),
      {
        githubProjectionAudit: {
          schemaVersion: "reader_summary.github_projection.v1",
          status: "verified",
          requestedUtcDay: "2026-07-05",
          pageCount: 1,
          scannedItemCount: 1,
          eligibleBindingIds: ["github-binding"],
          bindings: [],
          violationCodes: [],
          reasons: [],
        },
      },
    );

    expect(prisma.statusFor("reader-summary-unverified-github")).toBe(
      "REJECTED",
    );
  });

  it("stages and records the exact verified GitHub audit", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    const githubProjectionAudit = verifiedGitHubProjectionAudit();

    await repository.save(
      githubReaderSummaryArtifact("reader-summary-verified-github"),
      { githubProjectionAudit },
    );

    expect(prisma.statusFor("reader-summary-verified-github")).toBe("RUNNING");
    expect(
      prisma.qualitySignalsFor("reader-summary-verified-github"),
    ).toMatchObject({ githubProjectionAudit });
    expect(
      githubProjectionAudit.bindings.map((binding) => binding.rank),
    ).toEqual(Array.from({ length: 10 }, (_, index) => index + 1));
    expect(
      new Set(
        githubProjectionAudit.bindings.map((binding) => binding.scanJobId),
      ),
    ).toEqual(new Set(["scan-github-reader-summary-prisma"]));
    expect(
      githubProjectionAudit.bindings.every(
        (binding) =>
          binding.fetchStartedAt <= binding.checkedAt &&
          binding.publishedAt === binding.checkedAt &&
          binding.checkedAt <= binding.observedAt,
      ),
    ).toBe(true);
  });

  it("rejects a candidate without durable zero-binding proof", async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    await repository.save(
      readerSummaryArtifact("reader-summary-missing-binding-proof"),
    );

    expect(prisma.statusFor("reader-summary-missing-binding-proof")).toBe(
      "REJECTED",
    );
  });
});

type ReaderSummarySaveOptions = NonNullable<
  Parameters<PrismaReaderSummaryArtifactRepository["save"]>[1]
>;

const noEligibleGitHubBindingOptions = (
  options: Omit<ReaderSummarySaveOptions, "githubProjectionAudit"> = {},
): ReaderSummarySaveOptions => ({
  ...options,
  githubProjectionAudit: {
    schemaVersion: "reader_summary.github_projection.v1",
    status: "not_required",
    requestedUtcDay: "2026-07-05",
    pageCount: 1,
    scannedItemCount: 0,
    eligibleBindingIds: [],
    bindings: [],
    violationCodes: [],
    reasons: [],
  },
});

const rejectedDecision = {
  status: "rejected" as const,
  qualityPassed: false as const,
  canonicalScore: 0,
  shadow: {
    mode: "shadow" as const,
    policyVersion: "reader_summary_publication_shadow_v1" as const,
    riskScore: 0,
    signals: [],
  },
  reasonCodes: ["editorial_quality" as const],
  reasons: ["Editorial proof failed."],
  findings: [
    {
      code: "editorial_quality" as const,
      reason: "Editorial proof failed.",
    },
  ],
};

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

const githubReaderSummaryArtifact = (
  readerSummaryId: string,
): ReaderSummaryArtifact => {
  const snapshot = readerSummaryArtifact(readerSummaryId).toSnapshot();
  const githubSelectedPosts = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return {
      ...topRead(),
      title: `owner/repository-${rank}`,
      providerKey: "github-trending-page",
      providerName: "GitHub Trending",
      primaryActionKind: "watch_repository" as const,
      confirmedProviderKeys: ["github-trending-page"],
      providerMetrics: [
        {
          label: "GitHub Trending today",
          value: `#${rank}, +${200 + rank} stars today`,
        },
      ],
      canonicalUrl: `https://github.com/owner/repository-${rank}`,
      citationIds: [`github-citation-${rank}`],
    };
  });

  return ReaderSummaryArtifact.create({
    ...snapshot,
    sourceWindow: {
      ...snapshot.sourceWindow,
      selectedFeedItemIds: Array.from(
        { length: 10 },
        (_, index) => `feed-${index + 1}`,
      ),
      storyClusterIds: [],
    },
    storyClusters: [],
    headline: "No reliable workspace signal yet",
    executiveSummary:
      "No primary evidence passed selection for this summary window.",
    content: {
      ...snapshot.content!,
      headline: "No reliable workspace signal yet",
      oneLineTakeaway:
        "No primary evidence passed selection for this summary window.",
      bullets: [
        "No primary evidence passed selection for this summary window.",
      ],
      mainTopics: [],
      qualityState: {
        status: "no_signal",
        flags: ["no_signal", "limited_sources"],
        warnings: ["No primary evidence passed selection."],
        isSingleSource: false,
      },
      interestSections: [],
      sourceMix: [],
      topReads: [],
      selectedPosts: githubSelectedPosts,
      claimBoard: [],
      trendDelta: {
        newSignals: [],
        growingSignals: [],
        repeatedSignals: [],
        fadingSignals: [],
      },
      risks: [],
      openQuestions: ["Collect more primary evidence before making claims."],
      nextActions: [],
    },
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: githubSelectedPosts.map((post, index) => ({
      ...snapshot.citationMap[0]!,
      citationId: post.citationIds[0]!,
      feedItemId: `feed-${index + 1}`,
      sourceItemId: `source-${index + 1}`,
      providerKey: "github-trending-page",
      canonicalUrl: post.canonicalUrl,
    })),
    qualityFlags: ["no_signal", "limited_sources"],
    confidence: {
      level: "none",
      score: 0,
      rationale: "No primary evidence passed selection.",
    },
    noSignalReason: "No primary evidence passed selection.",
  });
};

const verifiedGitHubProjectionAudit =
  (): ReaderSummaryGitHubProjectionAudit => ({
    schemaVersion: "reader_summary.github_projection.v1",
    status: "verified",
    requestedUtcDay: "2026-07-05",
    pageCount: 1,
    scannedItemCount: 10,
    eligibleBindingIds: ["github-binding"],
    observedThrough: "2026-07-05T12:05:00.000Z",
    projectionCheckedAt: "2026-07-05T12:00:00.000Z",
    telemetry: {
      github_projection_collection_delay_ms: 0,
      collectionGraceMs: 300_000,
      warningThresholdMs: 240_000,
      qualitySignal: "within_grace",
    },
    bindings: Array.from({ length: 10 }, (_, index) => {
      const rank = index + 1;
      return {
        selectedPostIndex: index,
        rank,
        citationId: `github-citation-${rank}`,
        feedItemId: `feed-${rank}`,
        sourceItemId: `source-${rank}`,
        sourceBindingId: "github-binding",
        providerKey: "github-trending-page",
        metadataKind: "github_trending_page_repository",
        scanJobId: "scan-github-reader-summary-prisma",
        repositoryIdentity: `owner/repository-${rank}`,
        canonicalUrl: `https://github.com/owner/repository-${rank}`,
        starsGained: 200 + rank,
        fetchStartedAt: "2026-07-05T12:00:00.000Z",
        publishedAt: "2026-07-05T12:00:00.000Z",
        checkedAt: "2026-07-05T12:00:00.000Z",
        observedAt: "2026-07-05T12:05:00.000Z",
        sourceContentHash: "a".repeat(64),
        sourceProviderContentHash: "b".repeat(64),
      };
    }),
    violationCodes: [],
    reasons: [],
  });

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

  qualitySignalsFor(id: string): unknown {
    return this.records.get(id)?.qualitySignals;
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
