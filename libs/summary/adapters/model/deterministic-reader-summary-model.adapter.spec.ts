import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryCoveragePlan,
  buildReaderPostPromotionProjection,
  primaryReaderSummaryEvidence,
  ReaderSummaryArtifact,
  ReaderSummaryPublicationPolicy,
} from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelInput,
} from "../../ports";
import { DeterministicReaderSummaryModelAdapter } from "./deterministic-reader-summary-model.adapter";
import {
  composeReaderSummaryEditorialSlate,
  materializeReaderSummaryEditorialSlate,
} from "../evidence/reader-summary-editorial-slate";

describe("DeterministicReaderSummaryModelAdapter", () => {
  it("keeps a provider-diverse first page while preserving ranked order", async () => {
    const adapter = new DeterministicReaderSummaryModelAdapter();
    const input = dailySynthesisReaderSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "deterministic-local",
        maxInputTokens: 24_000,
        maxOutputTokens: 2_500,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, route);
    const citationProviders = attempt.draft.citationMap.map(
      (citation) => citation.providerKey,
    );

    expect(citationProviders).toContain("github-repo-radar");
    expect(
      attempt.draft.topStories.some((story) =>
        story.providerKeys.includes("github-repo-radar"),
      ),
    ).toBe(true);
    expect(attempt.draft.content).toBeDefined();
    expect(attempt.draft.headline).toBe(
      "4 monitored stories emerge across Hacker News, X Twitter, GitHub Repo Radar + 1 more",
    );
    expect(attempt.draft.headline).not.toMatch(/^(?:Hacker News|Reddit|X)\b/u);
    expect(attempt.draft.headline).not.toContain(";");
    expect(attempt.draft.content?.headline).toBe(attempt.draft.headline);
    expect(attempt.draft.headline).not.toContain("disposable Linux VM");
    expect(input.evidence.editorialSlate?.additional).toEqual([
      expect.objectContaining({
        candidateId: "feed-2",
        placement: "additional",
        reasonCodes: expect.arrayContaining(["top_floor_not_met"]),
      }),
    ]);
    expect(input.evidence.selectedEvidence.map((item) => item.feedItemId))
      .toContain("feed-2");
    expect(input.evidence.editorialSlate?.excluded).toContainEqual(
      expect.objectContaining({
        candidateId: "feed-5",
        reasonCodes: expect.arrayContaining(["provider_floor_not_met"]),
      }),
    );
    expect(input.evidence.selectedEvidence.map((item) => item.feedItemId))
      .not.toContain("feed-5");
    expect(
      attempt.draft.content?.topReads.map((item) => item.providerKey),
    ).toEqual([
      "hacker-news",
      "x-twitter",
      "github-repo-radar",
    ]);
    expect(
      attempt.draft.content?.selectedPosts?.map((item) => item.providerKey),
    ).toEqual(["reddit"]);
    expect(
      attempt.draft.content?.topReads.map((item) => item.providerKey),
    ).not.toContain("github-trending-page");
    expect(attempt.draft.executiveSummary).toContain(
      "Current executive summary covers 4 selected stories for workspace in an analytical tone.",
    );
    expect(attempt.draft.executiveSummary).not.toContain("story/stories");
    expect(attempt.draft.content?.bullets.join(" ")).not.toContain("Top links");
    expect(input.coveragePlan.mode).toBe("daily_synthesis");
    const narrativeSections = attempt.draft.content?.narrativeSections ?? [];
    const lead = narrativeSections.find((section) => section.kind === "lead");
    expect(lead).toMatchObject({ title: "Daily synthesis" });
    expect(lead?.storyClusterId).toBeUndefined();
    expect(citedClusterIds(input, attempt, lead?.citationIds ?? [])).toEqual(
      new Set([
        ...(input.coveragePlan.lead === undefined
          ? []
          : [input.coveragePlan.lead.clusterId]),
        ...input.coveragePlan.secondary.map((item) => item.clusterId),
      ]),
    );
    expect(
      narrativeSections.filter(
        (section) => section.kind === "secondary_signal",
      ),
    ).toHaveLength(input.coveragePlan.secondary.length);
    expectPublished(input, attempt);
  });

  it("creates a cluster-bound lead for single-story coverage", async () => {
    const adapter = new DeterministicReaderSummaryModelAdapter();
    const dailyInput = readerSummaryInput();
    const plannedLead = dailyInput.coveragePlan.lead;
    expect(plannedLead).toBeDefined();
    if (plannedLead === undefined) {
      throw new Error("Single-story test requires a planned coverage lead");
    }
    const input: ReaderSummaryModelInput = {
      ...dailyInput,
      coveragePlan: {
        mode: "single_story",
        lead: plannedLead,
        secondary: [],
      },
    };
    const selectedRoute = adapter.route(
      input,
      {
        preferredProvider: "deterministic-local",
        maxInputTokens: 24_000,
        maxOutputTokens: 2_500,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, selectedRoute);
    const narrativeSections = attempt.draft.content?.narrativeSections ?? [];
    const lead = narrativeSections.find((section) => section.kind === "lead");

    expect(lead).toMatchObject({
      kind: "lead",
      storyClusterId: plannedLead.clusterId,
    });
    expect(
      narrativeSections.filter(
        (section) => section.kind === "secondary_signal",
      ),
    ).toHaveLength(0);
    expect(citedClusterIds(input, attempt, lead?.citationIds ?? [])).toEqual(
      new Set([plannedLead.clusterId]),
    );
    expect(attempt.draft.headline).toBe("Discussion from monitored sources");
    expectPublished(input, attempt);
  });
});

const expectPublished = (
  input: ReaderSummaryModelInput,
  attempt: ProviderReaderSummaryAttempt,
): void => {
  const readerSummaryId = "reader-summary-deterministic-test";
  const promotion = buildReaderPostPromotionProjection({
    evidence: input.evidence.selectedEvidence,
    clusters: input.evidence.clusters,
    citations: attempt.draft.citationMap,
    sourceWindow: input.evidence.sourceWindow,
    approvedSameStoryRelations: input.evidence.approvedSameStoryRelations,
    relatedTopicRelations: input.evidence.relatedTopicRelations,
    editorialSlate: input.evidence.editorialSlate,
    attestationBinding: {
      artifactId: readerSummaryId,
      sourceWindow: input.evidence.sourceWindow,
    },
  });
  const artifact = ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    scope: input.scope,
    period: input.period,
    sourceWindow: input.evidence.sourceWindow,
    storyClusters: input.evidence.clusters,
    contextArtifacts: input.contextArtifacts,
    ...attempt.draft,
    promotionAttestations: promotion.attestations,
    promotionEvidenceFacts: promotion.attestedEvidenceFacts,
  });
  const decision = new ReaderSummaryPublicationPolicy().evaluate({
    artifact,
    evidence: input.evidence,
  });

  if (decision.status === "rejected") {
    throw new Error(decision.reasons.join("; "));
  }

  expect(decision).toMatchObject({
    status: "published",
    qualityPassed: true,
  });
};

const citedClusterIds = (
  input: ReaderSummaryModelInput,
  attempt: ProviderReaderSummaryAttempt,
  citationIds: readonly string[],
): ReadonlySet<string> => {
  const feedItemIdByCitationId = new Map(
    attempt.draft.citationMap.map(
      (citation) => [citation.citationId, citation.feedItemId] as const,
    ),
  );
  const clusterIdByFeedItemId = new Map(
    input.evidence.clusters.flatMap((cluster) =>
      [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].map(
        (feedItemId) => [feedItemId, cluster.id] as const,
      ),
    ),
  );

  return new Set(
    citationIds.flatMap((citationId) => {
      const clusterId = clusterIdByFeedItemId.get(
        feedItemIdByCitationId.get(citationId) ?? "",
      );
      return clusterId === undefined ? [] : [clusterId];
    }),
  );
};

const readerSummaryInput = (): ReaderSummaryModelInput => {
  const selectedEvidence = [
    evidenceItem("rss", 1, 1.5),
    evidenceItem("rss", 2, 1.5),
    evidenceItem("github-trending-page", 3, 1.5),
    evidenceItem("github-trending-page", 4, 1.5),
    evidenceItem("github-trending-page", 5, 1.5),
    evidenceItem("rss", 6, 1.497),
    evidenceItem("rss", 7, 1.495),
    evidenceItem("hacker-news", 8, 1.488),
    evidenceItem("reddit", 9, 1.437),
    evidenceItem("hacker-news", 10, 1.238),
    evidenceItem("reddit", 11, 1),
    evidenceItem("github-issues", 12, 1),
  ];
  const evidence = readerSummaryEvidence(selectedEvidence);

  return readerSummaryInputForEvidence(evidence);
};

const dailySynthesisReaderSummaryInput = (): ReaderSummaryModelInput => {
  const selectedEvidence = [
    {
      ...evidenceItem("hacker-news", 1, 3),
      title: "Disposable Linux VMs isolate coding agents",
      bodyPreview:
        "A sandboxing project gives coding agents short-lived Linux machines.",
    },
    {
      ...evidenceItem("reddit", 2, 2.8),
      title: "Developers compare subscription quota tradeoffs",
      bodyPreview:
        "Teams compare model access, token budgets and predictable pricing.",
    },
    {
      ...evidenceItem("x-twitter", 3, 2.6),
      title: "Local inference orchestration reaches more workstations",
      bodyPreview:
        "A release routes local inference across independently managed devices.",
    },
    {
      ...evidenceItem("github-repo-radar", 4, 2.4),
      title: "Agent tool maintainers document safer defaults",
      bodyPreview:
        "Maintainers discuss permission boundaries and safer execution defaults.",
    },
    {
      ...evidenceItem("reddit", 5, 2.2),
      title: "Below-floor discussion must not enter the reader slate",
      promotionFacts: {
        ...promotionFacts("reddit", 5),
        metrics: {
          provider: "reddit",
          score: 24,
          upvoteRatio: 0.99,
        },
      },
    },
  ] satisfies ReaderSummaryModelInput["evidence"]["selectedEvidence"];
  const evidence = readerSummaryEvidence(selectedEvidence);

  return readerSummaryInputForEvidence(evidence);
};

const readerSummaryEvidence = (
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
): ReaderSummaryModelInput["evidence"] => {
  const clusters = selectedEvidence.map((item) => ({
    id: `story:${item.feedItemId}`,
    storyKey: `story-key:${item.feedItemId}`,
    representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [],
    interestIds: [item.interestId],
    providerKeys: [item.providerKey],
    score: item.score,
    observedAtRange: {
      startedAt: item.observedAt,
      endedAt: new Date(item.observedAt.getTime() + 1),
    },
    whyImportant: item.whyImportant,
  }));

  const selection: ReaderSummaryModelInput["evidence"] = {
    rankingPolicyVersion: "story_ranking_v1",
    sourceWindow: {
      windowId: "workspace:deterministic-reader-summary",
      startedAt:
        selectedEvidence[0]?.observedAt ?? new Date("2026-06-23T08:00:00.000Z"),
      endedAt:
        selectedEvidence.at(-1)?.observedAt ??
        new Date("2026-06-23T08:30:00.000Z"),
      periodStartedAt: new Date("2026-06-23T00:00:00.000Z"),
      periodEndedAt: new Date("2026-06-24T00:00:00.000Z"),
      ingestionCutoff: new Date("2026-06-23T08:30:00.000Z"),
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: clusters.map((cluster) => cluster.id),
    },
    clusters,
    selectedEvidence,
  };
  const editorialSlate = composeReaderSummaryEditorialSlate({ selection });
  return materializeReaderSummaryEditorialSlate({
    selection,
    slate: editorialSlate,
  });
};

const readerSummaryInputForEvidence = (
  evidence: ReaderSummaryModelInput["evidence"],
): ReaderSummaryModelInput => ({
  tenantId: tenantId("tenant-deterministic-reader-summary-adapter"),
  workspaceId: workspaceId("workspace-deterministic-reader-summary-adapter"),
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-06-23T00:00:00.000Z"),
    endedAt: new Date("2026-06-24T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
  },
  evidence,
  coveragePlan: buildReaderSummaryCoveragePlan(
    primaryReaderSummaryEvidence(evidence),
  ),
  contextArtifacts: [],
  policy: {
    language: "auto",
    format: "executive_brief",
    tone: "analytical",
    maxStories: 10,
    includeRisks: true,
    includeInterestHighlights: true,
    includeRepeatedSignals: true,
    dedupeStrategy: "canonical_url_then_title",
    rulesVersion: "reader_summary.rules.test.v1",
  },
  requestedAt: new Date("2026-06-23T08:31:00.000Z"),
});

const evidenceItem = (
  providerKey: string,
  index: number,
  score: number,
): ReaderSummaryModelInput["evidence"]["selectedEvidence"][number] => ({
  feedItemId: `feed-${index}`,
  sourceItemId: `source-${index}`,
  sourceBindingId: `binding-${providerKey}`,
  interestId: `interest-${index % 2}`,
  providerKey,
  canonicalUrl: `https://example.test/${providerKey}/${index}`,
  title: `${providerKey} story ${index}`,
  bodyPreview: "Useful source evidence for a workspace summary.",
  publishedAt: new Date(
    `2026-06-23T08:${String(index).padStart(2, "0")}:00.000Z`,
  ),
  observedAt: new Date(
    `2026-06-23T08:${String(index).padStart(2, "0")}:30.000Z`,
  ),
  score: score + 1,
  whyImportant: ["Fresh item in the current monitoring window"],
  contentQuality: eligiblePromotionQuality(),
  promotionFacts: promotionFacts(providerKey, index),
});

const eligiblePromotionQuality = () => ({
  qualityScore: 0.9,
  interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "eligible",
  flags: [],
  reason: "Promotion fixture",
});

const promotionFacts = (providerKey: string, index: number) => {
  const canonicalIdentity = `url:https://example.test/${providerKey}/${index}`;
  const common = {
    canonicalIdentity,
    safetyValid: true,
    freshnessValid: true,
    freshnessProvenance: {
      status: "observed" as const,
      publishedAt: new Date(
        `2026-06-23T08:${String(index).padStart(2, "0")}:00.000Z`,
      ),
      observedAt: new Date(
        `2026-06-23T08:${String(index).padStart(2, "0")}:30.000Z`,
      ),
      ingestionCutoff: new Date("2026-06-23T08:30:00.000Z"),
    },
    metricsState: "observed" as const,
  };
  if (providerKey === "hacker-news") return {
    ...common,
    contentKind: "story" as const,
    engagementAuthority: durableEngagementAuthority(),
    metrics: { provider: "hacker_news" as const, points: 60 },
  };
  if (providerKey === "x-twitter") return {
    ...common,
    contentKind: "original_post" as const,
    engagementAuthority: durableEngagementAuthority(),
    metrics: {
      provider: "x" as const,
      likes: 60,
      reposts: 10,
      weightedScore: 80,
    },
  };
  if (providerKey === "github-repo-radar") {
    const checkedAt = new Date(
      `2026-06-23T08:${String(index).padStart(2, "0")}:30.000Z`,
    );
    return {
      ...common,
      contentKind: "repository" as const,
      checkedAt,
      metrics: {
        provider: "github_radar" as const,
        snapshotKind: "repository_growth" as const,
        windowStartedAt: new Date(checkedAt.getTime() - 86_400_000),
        windowEndedAt: checkedAt,
        starsDelta: 50,
        forksDelta: 3,
      },
    };
  }
  return {
    ...common,
    contentKind: "original_post" as const,
    engagementAuthority: durableEngagementAuthority(),
    metrics: {
      provider: "reddit" as const,
      score: 25,
      upvoteRatio: 0.55,
    },
  };
};

const durableEngagementAuthority = () => ({
  observedAt: new Date("2026-06-23T08:30:00.000Z"),
  regressionState: "stable" as const,
});
