import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  ReaderSummaryArtifact,
  type ReaderSummaryGitHubProjectionAudit,
} from "../../domain";
import { emptyReaderSummaryReliabilityReport } from "../../domain/entities/reader-summary-reliability";
import { InMemoryReaderSummaryArtifactRepository } from "./in-memory-reader-summary-artifact.repository";

const tenant = tenantId("tenant-reader-summary-memory-artifact");
const workspace = workspaceId("workspace-reader-summary-memory-artifact");

describe("InMemoryReaderSummaryArtifactRepository", () => {
  it("keeps candidates hidden and preserves rejected debug evidence", async () => {
    const repository = new InMemoryReaderSummaryArtifactRepository();

    await repository.save(artifact("reader-summary-memory-a", "Older summary"));
    await repository.save(
      artifact("reader-summary-memory-b", "Latest summary"),
    );
    await repository.save(artifact("reader-summary-memory-a", "Older summary"));

    const visibleBeforeRejected = await repository.list(listQuery());
    expect(visibleBeforeRejected.items).toEqual([]);

    await repository.save(
      artifact("reader-summary-memory-c", "Rejected summary"),
      noEligibleGitHubBindingOptions({
        publicationDecision: {
          status: "rejected",
          qualityPassed: false,
          canonicalScore: 0.2,
          shadow: {
            mode: "shadow",
            policyVersion: "reader_summary_publication_shadow_v1",
            riskScore: 0.7,
            signals: [
              {
                code: "single_source",
                score: 0.7,
                reason:
                  "Selected evidence comes from a single provider family.",
              },
            ],
          },
          reasonCodes: ["top_read_ineligible_source"],
          reasons: ["Top read references ineligible evidence."],
          findings: [
            {
              code: "top_read_ineligible_source",
              reason: "Top read references ineligible evidence.",
              topReadTitle: "Rejected summary",
              citationId: "reader-summary-memory-citation",
              feedItemId: "reader-summary-memory-feed",
              sourceItemId: "reader-summary-memory-source",
              providerKey: "rss",
              canonicalUrl: "https://example.test/reader-summary-memory-feed",
            },
          ],
        },
      }),
    );

    const visibleAfterRejected = await repository.list(listQuery());
    expect(visibleAfterRejected.items).toEqual([]);
    await expect(
      repository.findById({
        tenantId: tenant,
        workspaceId: workspace,
        readerSummaryId: "reader-summary-memory-c",
      }),
    ).resolves.toBeNull();
    await expect(
      repository.findRejectedDebugById({
        tenantId: tenant,
        workspaceId: workspace,
        readerSummaryId: "reader-summary-memory-c",
      }),
    ).resolves.toMatchObject({
      reasonCodes: ["top_read_ineligible_source"],
      violations: [
        expect.objectContaining({
          code: "top_read_ineligible_source",
          citationId: "reader-summary-memory-citation",
          feedItemId: "reader-summary-memory-feed",
        }),
      ],
    });
  });

  it("uses top story fallback for rejected artifact debug top reads", async () => {
    const repository = new InMemoryReaderSummaryArtifactRepository();

    await repository.save(
      artifactWithoutContent(
        "reader-summary-memory-rejected-without-content",
        "Rejected summary without content",
      ),
      noEligibleGitHubBindingOptions({
        publicationDecision: {
          status: "rejected",
          qualityPassed: false,
          canonicalScore: 0.2,
          shadow: {
            mode: "shadow",
            policyVersion: "reader_summary_publication_shadow_v1",
            riskScore: 0,
            signals: [],
          },
          reasonCodes: ["top_read_ineligible_source"],
          reasons: ["Top read references ineligible evidence."],
          findings: [
            {
              code: "top_read_ineligible_source",
              reason: "Top read references ineligible evidence.",
              topReadTitle: "Reader source signal",
              citationId: "reader-summary-memory-citation",
              feedItemId: "reader-summary-memory-feed",
            },
          ],
        },
      }),
    );

    await expect(
      repository.findRejectedDebugById({
        tenantId: tenant,
        workspaceId: workspace,
        readerSummaryId: "reader-summary-memory-rejected-without-content",
      }),
    ).resolves.toMatchObject({
      topReads: [
        {
          title: "Reader source signal",
          providerKey: "rss",
          canonicalUrl: "https://example.test/reader-summary-memory",
          citationIds: ["reader-summary-memory-citation"],
        },
      ],
    });
  });

  it("refuses to expose a GitHub candidate without an exact verified audit", async () => {
    const repository = new InMemoryReaderSummaryArtifactRepository();
    const candidate = artifactWithGitHubSelectedPost(
      "reader-summary-unverified-github",
    );

    await repository.save(candidate, {
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
    });

    expect(() => repository.commitPublication(candidate)).toThrow(
      "verified staged candidate",
    );
    await expect(repository.findById({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryId: "reader-summary-unverified-github",
    })).resolves.toBeNull();
  });

  it("requires durable zero-binding proof before staging non-GitHub output", async () => {
    const repository = new InMemoryReaderSummaryArtifactRepository();
    const candidate = artifact(
      "reader-summary-missing-binding-proof",
      "Unproven summary",
    );

    await repository.save(candidate);

    expect(() => repository.commitPublication(candidate)).toThrow(
      "verified staged candidate",
    );
  });
});

type ReaderSummarySaveOptions = NonNullable<
  Parameters<InMemoryReaderSummaryArtifactRepository["save"]>[1]
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
  } satisfies ReaderSummaryGitHubProjectionAudit,
});

const listQuery = () => ({
  tenantId: tenant,
  workspaceId: workspace,
  scope: { type: "workspace" as const },
  cadence: "daily" as const,
  periodStartedAt: new Date("2026-07-05T00:00:00.000Z"),
  periodEndedAt: new Date("2026-07-06T00:00:00.000Z"),
  timezone: "UTC",
  limit: 10,
});

const artifact = (
  readerSummaryId: string,
  headline: string,
  modelVersion = "in-memory-reader-summary-test",
): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: new Date("2026-07-05T00:00:00.000Z"),
      endedAt: new Date("2026-07-06T00:00:00.000Z"),
      timezone: "UTC",
      periodKey: "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
    },
    sourceWindow: {
      windowId: "reader-summary-memory-window",
      startedAt: new Date("2026-07-05T08:00:00.000Z"),
      endedAt: new Date("2026-07-05T09:00:00.000Z"),
      selectedFeedItemIds: ["reader-summary-memory-feed"],
      storyClusterIds: ["reader-summary-memory-story"],
    },
    storyClusters: [
      {
        id: "reader-summary-memory-story",
        storyKey: "reader-summary-memory-story-key",
        representativeFeedItemId: "reader-summary-memory-feed",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["rss"],
        score: 1,
        observedAtRange: {
          startedAt: new Date("2026-07-05T08:00:00.000Z"),
          endedAt: new Date("2026-07-05T09:00:00.000Z"),
        },
        whyImportant: ["Relevant signal"],
      },
    ],
    contextArtifacts: [],
    headline,
    executiveSummary: "A cited source backs the reader summary.",
    content: {
      headline,
      oneLineTakeaway: "A cited source backs the reader summary.",
      bullets: ["A cited RSS source is relevant."],
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
      openQuestions: [],
      risks: [],
      nextActions: [],
    },
    topStories: [
      {
        storyClusterId: "reader-summary-memory-story",
        title: "Reader source signal",
        summary: "A cited source backs the reader summary.",
        interestIds: ["interest-ai"],
        providerKeys: ["rss"],
        citationIds: ["reader-summary-memory-citation"],
      },
    ],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [
      {
        citationId: "reader-summary-memory-citation",
        feedItemId: "reader-summary-memory-feed",
        sourceItemId: "reader-summary-memory-source",
        providerKey: "rss",
        field: "bodyPreview",
        canonicalUrl: "https://example.test/reader-summary-memory",
      },
    ],
    qualityFlags: [],
    confidence: {
      level: "high",
      score: 0.9,
      rationale: "The cited source supports the summary.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion,
      providerVersion: "deterministic-local",
      rulesVersion: "reader-summary.rules.test.v1",
      evalDatasetVersion: "reader-summary.eval.test.v1",
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0,
    },
  });

const artifactWithoutContent = (
  readerSummaryId: string,
  headline: string,
): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    ...artifact(readerSummaryId, headline).toSnapshot(),
    content: undefined,
  });

const artifactWithGitHubSelectedPost = (
  readerSummaryId: string,
): ReaderSummaryArtifact => {
  const snapshot = artifact(readerSummaryId, "GitHub summary").toSnapshot();
  const githubTopRead = {
    ...topRead(),
    title: "owner/repository",
    providerKey: "github-trending-page",
    providerName: "GitHub Trending",
    primaryActionKind: "watch_repository" as const,
    confirmedProviderKeys: ["github-trending-page"],
    providerMetrics: [
      {
        label: "GitHub Trending today",
        value: "#1, +200 stars today",
      },
    ],
    canonicalUrl: "https://github.com/owner/repository",
  };

  return ReaderSummaryArtifact.create({
    ...snapshot,
    storyClusters: snapshot.storyClusters.map((cluster) => ({
      ...cluster,
      providerKeys: ["github-trending-page"],
    })),
    content: {
      ...snapshot.content!,
      sourceMix: snapshot.content!.sourceMix.map((source) => ({
        ...source,
        providerKey: "github-trending-page",
      })),
      topReads: [githubTopRead],
      selectedPosts: [githubTopRead],
    },
    topStories: snapshot.topStories.map((story) => ({
      ...story,
      providerKeys: ["github-trending-page"],
    })),
    citationMap: snapshot.citationMap.map((citation) => ({
      ...citation,
      providerKey: "github-trending-page",
      canonicalUrl: "https://github.com/owner/repository",
    })),
  });
};

const topRead = () => ({
  title: "Reader source signal",
  providerKey: "rss",
  providerName: "RSS",
  primaryActionKind: "read_source" as const,
  reason: "It is relevant to the monitored topic.",
  matchedInterestIds: ["interest-ai"],
  matchedRules: ["ai"],
  signalScore: 1,
  confidence: {
    level: "medium" as const,
    score: 0.7,
    rationale: "The cited source supports the summary.",
  },
  confirmedProviderKeys: ["rss"],
  providerMetrics: [],
  whyImportant: ["Relevant signal"],
  whyNow: "It appeared in the current summary window.",
  canonicalUrl: "https://example.test/reader-summary-memory",
  citationIds: ["reader-summary-memory-citation"],
});
