import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import { emptyReaderSummaryReliabilityReport } from "../entities/reader-summary-reliability";
import {
  evaluateReaderSummaryGitHubProjection,
  type ReaderSummaryGitHubProjectionItem,
} from "./reader-summary-github-projection-policy";

export const evaluateGitHubProjection = (
  artifact: ReaderSummaryArtifact,
  items: readonly ReaderSummaryGitHubProjectionItem[],
  eligibleBindingIds: readonly string[] = ["github-binding-a"],
  observedThrough = new Date("2026-07-11T01:00:00.000Z"),
) =>
  evaluateReaderSummaryGitHubProjection({
    artifact,
    eligibleBindingIds,
    items,
    pageCount: 2,
    observedThrough,
  });

export const githubProjectionInput = (
  overrides: {
    readonly firstCanonicalUrl?: string;
    readonly checkedAt?: Date;
    readonly publishedAt?: Date;
    readonly observedAt?: Date;
  } = {},
): readonly ReaderSummaryGitHubProjectionItem[] =>
  Array.from({ length: 10 }, (_, index) =>
    githubProjectionItem(index + 1, {
      ...(index === 0 && overrides.firstCanonicalUrl !== undefined
        ? { canonicalUrl: overrides.firstCanonicalUrl }
        : {}),
      ...(overrides.checkedAt === undefined
        ? {}
        : { checkedAt: overrides.checkedAt }),
      ...(overrides.publishedAt === undefined
        ? {}
        : { publishedAt: overrides.publishedAt }),
      ...(overrides.observedAt === undefined
        ? {}
        : { observedAt: overrides.observedAt }),
    }),
  );

export const githubProjectionItem = (
  rank: number,
  overrides: {
    readonly identityPrefix?: string;
    readonly idPrefix?: string;
    readonly canonicalUrl?: string;
    readonly sourceBindingId?: string;
    readonly starsGained?: number;
    readonly checkedAt?: Date;
    readonly publishedAt?: Date;
    readonly observedAt?: Date;
  } = {},
): ReaderSummaryGitHubProjectionItem => {
  const identity = `${overrides.identityPrefix ?? "owner/repo"}-${rank}`;
  const idPrefix = overrides.idPrefix ?? "github";
  return {
    feedItemId: `${idPrefix}-feed-${rank}`,
    sourceItemId: `${idPrefix}-source-${rank}`,
    sourceBindingId: overrides.sourceBindingId ?? "github-binding-a",
    canonicalUrl: overrides.canonicalUrl ?? `https://github.com/${identity}`,
    repositoryFullName: identity,
    rank,
    starsGained: overrides.starsGained ?? 100 + rank,
    window: "daily",
    checkedAt:
      overrides.checkedAt ?? new Date("2026-07-10T12:00:00.000Z"),
    publishedAt:
      overrides.publishedAt ?? new Date("2026-07-10T12:00:00.000Z"),
    observedAt:
      overrides.observedAt ?? new Date("2026-07-10T12:05:00.000Z"),
    sourceContentHash: "a".repeat(64),
    sourceProviderContentHash: "b".repeat(64),
  };
};

export const artifactWithoutGitHubEvidence = (
  period: {
    readonly cadence: "daily" | "weekly" | "custom";
    readonly startedAt: Date;
    readonly endedAt: Date;
    readonly periodKey: string;
  } = {
    cadence: "daily",
    startedAt: new Date("2026-07-10T00:00:00.000Z"),
    endedAt: new Date("2026-07-11T00:00:00.000Z"),
    periodKey: "daily:2026-07-10:UTC",
  },
): ReaderSummaryArtifact =>
  ({
    toSnapshot: () => ({
      scope: { type: "workspace" },
      period: {
        cadence: period.cadence,
        startedAt: period.startedAt,
        endedAt: period.endedAt,
        timezone: "UTC",
        periodKey: period.periodKey,
      },
      content: { selectedPosts: [], narrativeSections: [] },
      citationMap: [],
    }),
  }) as unknown as ReaderSummaryArtifact;

export const githubBoardArtifact = (
  overrides: {
    readonly selectedPostCount?: number;
    readonly firstCanonicalUrl?: string;
    readonly timezone?: string;
    readonly firstSelectedPostHasExtraCitation?: boolean;
    readonly includeEditorialSelectedPost?: boolean;
    readonly watchRank?: number;
    readonly watchStarsGained?: number;
    readonly dayStartedAt?: Date;
    readonly dayEndedAt?: Date;
  } = {},
): ReaderSummaryArtifact => {
  const selectedPostCount = overrides.selectedPostCount ?? 10;
  const dayStartedAt =
    overrides.dayStartedAt ?? new Date("2026-07-10T00:00:00.000Z");
  const dayEndedAt =
    overrides.dayEndedAt ?? new Date("2026-07-11T00:00:00.000Z");
  const githubCitations = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return {
      citationId: `github-citation-${rank}`,
      feedItemId: `github-feed-${rank}`,
      sourceItemId: `github-source-${rank}`,
      providerKey: "github-trending-page",
      field: "canonicalUrl" as const,
      canonicalUrl:
        rank === 1 && overrides.firstCanonicalUrl !== undefined
          ? overrides.firstCanonicalUrl
          : `https://github.com/owner/repo-${rank}`,
    };
  });
  const editorialCitation = {
    citationId: "editorial-citation",
    feedItemId: "editorial-feed",
    sourceItemId: "editorial-source",
    providerKey: "rss",
    field: "canonicalUrl" as const,
    canonicalUrl: "https://example.test/editorial-source",
  };
  const watchCitation =
    overrides.watchRank === undefined
      ? undefined
      : {
          citationId: `github-citation-${overrides.watchRank}`,
          feedItemId: `github-feed-${overrides.watchRank}`,
          sourceItemId: `github-source-${overrides.watchRank}`,
          providerKey: "github-trending-page",
          field: "canonicalUrl" as const,
          canonicalUrl: `https://github.com/owner/repo-${overrides.watchRank}`,
        };
  const citations = [
    ...githubCitations,
    editorialCitation,
    ...(watchCitation === undefined ? [] : [watchCitation]),
  ];
  const githubSelectedPosts = githubCitations
    .slice(0, selectedPostCount)
    .map((citation, index) =>
      githubReaderItem(index + 1, citation.canonicalUrl, citation.citationId),
    );
  const selectedPosts = overrides.includeEditorialSelectedPost
    ? [editorialReaderItem(editorialCitation.citationId), ...githubSelectedPosts]
    : githubSelectedPosts;
  if (overrides.firstSelectedPostHasExtraCitation && selectedPosts[0]) {
    selectedPosts[0] = {
      ...selectedPosts[0],
      citationIds: [selectedPosts[0].citationIds[0]!, editorialCitation.citationId],
    };
  }
  const editorialTopRead = editorialReaderItem(editorialCitation.citationId);
  const watchStarsGained = overrides.watchStarsGained ?? 1_001;

  return ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: "reader-summary-github-projection",
    tenantId: tenantId("tenant-github-projection"),
    workspaceId: workspaceId("workspace-github-projection"),
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: dayStartedAt,
      endedAt: dayEndedAt,
      timezone: overrides.timezone ?? "UTC",
      periodKey: `daily:${dayStartedAt.toISOString()}:${dayEndedAt.toISOString()}:${overrides.timezone ?? "UTC"}`,
    },
    sourceWindow: {
      windowId: "window-github-projection",
      startedAt: dayStartedAt,
      endedAt: dayEndedAt,
      selectedFeedItemIds: citations.map((citation) => citation.feedItemId),
      storyClusterIds: [],
    },
    storyClusters: [],
    contextArtifacts: [],
    headline: "Social coverage tracks GitHub developer-tool adoption",
    executiveSummary:
      "An RSS editorial source reports how teams are adopting GitHub developer tools.",
    content: {
      headline: "Social coverage tracks GitHub developer-tool adoption",
      oneLineTakeaway:
        "Editorial reporting, not the GitHub board, leads the daily summary.",
      bullets: ["A social source discusses GitHub developer-tool adoption."],
      mainTopics: ["GitHub developer ecosystem"],
      narrativeSections: [
        {
          id: "lead",
          kind: "lead",
          title: "Developer-tool adoption",
          text: "Editorial coverage says teams are expanding their use of GitHub tools.",
          citationIds: [editorialCitation.citationId],
        },
        ...(watchCitation === undefined
          ? []
          : [
              {
                id: "github-trending",
                kind: "watch" as const,
                title: "GitHub Trending",
                text: `- **owner/repo-${overrides.watchRank}**: +${watchStarsGained.toLocaleString("en-US")} stars today.`,
                citationIds: [watchCitation.citationId],
              },
            ]),
      ],
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
          interestIds: ["interest-developer-tools"],
        },
      ],
      topReads: [editorialTopRead],
      selectedPosts,
      claimBoard: [],
      reliabilityReport: emptyReaderSummaryReliabilityReport(),
      trendDelta: {
        newSignals: ["Editorial coverage highlights GitHub tool adoption"],
        growingSignals: [],
        repeatedSignals: [],
        fadingSignals: [],
      },
      risks: [],
      openQuestions: [],
      nextActions: [],
    },
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: citations,
    qualityFlags: ["no_signal"],
    noSignalReason:
      "The fixture isolates projection validation from editorial generation.",
    confidence: {
      level: "medium",
      score: 0.7,
      rationale: "The editorial source supports the primary narrative.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "projection-policy-test",
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
};

export const githubReaderItem = (
  rank: number,
  canonicalUrl: string,
  citationId: string,
) => ({
  title: `owner/repo-${rank}`,
  providerKey: "github-trending-page",
  providerName: "GitHub Trending",
  primaryActionKind: "watch_repository" as const,
  reason: "The repository appears in the daily GitHub Trending board.",
  matchedInterestIds: ["interest-github"],
  matchedRules: ["github"],
  signalScore: 1,
  confidence: {
    level: "medium" as const,
    score: 0.7,
    rationale: "GitHub reports the daily rank and star gain.",
  },
  confirmedProviderKeys: ["github-trending-page"],
  providerMetrics: [
    {
      label: "GitHub Trending today",
      value: `#${rank}, +${100 + rank} stars today`,
    },
  ],
  whyImportant: ["The repository has visible daily momentum."],
  whyNow: "It appears in today's GitHub Trending projection.",
  canonicalUrl,
  citationIds: [citationId],
});

const editorialReaderItem = (citationId: string) => ({
  title: "How teams adopt developer tools",
  providerKey: "rss",
  providerName: "Editorial RSS",
  primaryActionKind: "read_source" as const,
  reason: "Editorial reporting explains adoption patterns.",
  matchedInterestIds: ["interest-developer-tools"],
  matchedRules: ["developer tools"],
  signalScore: 1,
  confidence: {
    level: "medium" as const,
    score: 0.7,
    rationale: "The source directly reports the adoption pattern.",
  },
  confirmedProviderKeys: ["rss"],
  providerMetrics: [],
  whyImportant: ["The report describes how teams are changing workflows."],
  whyNow: "The editorial item was published in the requested day.",
  canonicalUrl: "https://example.test/editorial-source",
  citationIds: [citationId],
});
