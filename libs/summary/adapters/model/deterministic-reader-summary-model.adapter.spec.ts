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
  ReaderSummaryModelRoute,
} from "../../ports";
import { DeterministicReaderSummaryModelAdapter } from "./deterministic-reader-summary-model.adapter";
import {
  selectClustersForEvidence,
  selectProviderDiverseRankedEvidence,
} from "./deterministic-reader-summary-evidence-selection";
import { selectDeterministicReaderSummaryCoverage } from "./deterministic-reader-summary-coverage-selection";
import { buildDeterministicReaderSummaryStoryProjection } from "./deterministic-reader-summary-story-projection";
import { acceptedDeterministicFixtureHeadline } from "./deterministic-reader-summary-model.spec-support";
import {
  composeReaderSummaryEditorialSlate,
  materializeReaderSummaryEditorialSlate,
} from "../evidence/reader-summary-editorial-slate";

describe("DeterministicReaderSummaryModelAdapter", () => {
  it("preserves the deterministic no-primary-evidence contract", async () => {
    const adapter = new DeterministicReaderSummaryModelAdapter();
    const input = readerSummaryInputForEvidence(readerSummaryEvidence([]));
    const selectedRoute = adapter.route(
      input,
      {
        preferredProvider: "deterministic-local",
        maxInputTokens: 24_000,
        maxOutputTokens: 2_500,
        maxEstimatedCostUsd: 1,
      },
      { remainingTokens: 32_000, remainingCostUsd: 2 },
    );
    const attempt = await adapter.generate(input, selectedRoute);
    expect(attempt.draft).toMatchObject({
      headline: "No reliable workspace signal yet",
      executiveSummary: "No eligible feed items were available for this summary window.",
      topStories: [],
      interestHighlights: [],
      repeatedSignals: [],
      qualityFlags: ["no_signal", "limited_sources"],
      confidence: { level: "none", score: 0 },
      noSignalReason: "No eligible evidence items selected for this summary scope.",
      usage: { inputTokens: 0, outputTokens: 64, estimatedCostUsd: 0 },
      lineage: { modelVersion: "deterministic-reader-summary-v1" },
    });
    expect(attempt.draft.citationMap).toEqual([]);
    expect(attempt.draft.content).toBeDefined();
  });

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
    expect(input.evidence.editorialSlate?.additional).toEqual([]);
    expect(input.evidence.editorialSlate?.top.map((entry) => entry.candidateId))
      .toContain("feed-2");
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
      "reddit",
    ]);
    expect(
      attempt.draft.content?.selectedPosts?.map((item) => item.providerKey),
    ).toEqual([]);
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

  it.each([
    {
      sourceTitle: "Developers compare runtime isolation tradeoffs",
      headline: "Reports discuss Developers compare runtime isolation tradeoffs",
    },
    {
      sourceTitle: "hacker-news story 10",
      headline: "Reports discuss hacker-news story 10",
    },
    {
      sourceTitle: "Developers compare runtime isolation tradeoffs.\n\nPreview deployments remain limited to test workspaces.",
      headline: "Discussion from monitored sources",
    },
    ...[
      "Post explores runtime isolation tradeoffs",
      "Discussion of runtime isolation tradeoffs",
      "Thread compares runtime isolation tradeoffs",
      "Reports explore runtime isolation tradeoffs",
    ].map((sourceTitle) => ({
      sourceTitle, headline: `Reports discuss ${sourceTitle}`,
    })),
  ])("publishes cluster-bound single-story coverage: $sourceTitle", async ({
    sourceTitle, headline,
  }) => {
    const adapter = new DeterministicReaderSummaryModelAdapter();
    const dailyInput = readerSummaryInput(sourceTitle);
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
    expect(attempt.draft.content?.topReads[0]).toMatchObject({
      title: sourceTitle.replace(/\n\n/gu, " "),
      promotionCandidateId: "feed-10",
      displayHeadline: { status: "accepted" },
      capturedSource: {
        title: sourceTitle,
        body: "Useful source evidence for a workspace summary.",
        captureAvailability: "available",
      },
    });
    expect(input.evidence.selectedEvidence).toContainEqual(
      expect.objectContaining({
        feedItemId: "feed-10",
        sourceItemId: "source-10",
        providerKey: "hacker-news",
        canonicalUrl: "https://example.test/hacker-news/10",
        title: sourceTitle,
        bodyPreview: "Useful source evidence for a workspace summary.",
      }),
    );
    expect(attempt.draft.headline).toBe(headline);
    expect(attempt.draft.content?.headline).toBe(attempt.draft.headline);
    expect(attempt.draft.headline).not.toBe(sourceTitle);
    expectPublished(input, attempt);
  });

  it("keeps citations attached to original evidence when ranked presentation order differs", () => {
    const input = dailySynthesisReaderSummaryInput();
    const citedEvidence = input.evidence.selectedEvidence;
    const firstItem = citedEvidence[0];
    if (firstItem === undefined) {
      throw new Error("Projection fixture needs primary evidence");
    }
    const projection = buildDeterministicReaderSummaryStoryProjection({
      input,
      citedEvidence,
      selectedEvidence: [...citedEvidence].reverse(),
      topStoryClusters: input.evidence.clusters,
      firstItem,
    });

    expect(projection.citationMap.map((item) => item.feedItemId)).toEqual(
      citedEvidence.map((item) => item.feedItemId),
    );
    for (const story of projection.topStories) {
      const representative = input.evidence.clusters.find(
        (cluster) => cluster.id === story.storyClusterId,
      );
      const citation = projection.citationMap.find(
        (item) => item.feedItemId === representative?.representativeFeedItemId,
      );
      expect(story.citationIds).toEqual([citation?.citationId ?? "c1"]);
    }
  });

  it("keeps the first cited feed identity in top stories, interest highlights and repeated signals", () => {
    const input = dailySynthesisReaderSummaryInput();
    const firstItem = input.evidence.selectedEvidence[0];
    const firstCluster = input.evidence.clusters[0];
    if (firstItem === undefined || firstCluster === undefined) {
      throw new Error("Citation identity regression requires evidence and a cluster");
    }
    const repeatedCluster = {
      ...firstCluster,
      representativeFeedItemId: firstItem.feedItemId,
      interestIds: ["interest-0", "interest-1"],
    };
    const projection = buildDeterministicReaderSummaryStoryProjection({
      input: {
        ...input,
        evidence: { ...input.evidence, clusters: [repeatedCluster] },
      },
      citedEvidence: [firstItem, firstItem],
      selectedEvidence: [firstItem],
      topStoryClusters: [repeatedCluster],
      firstItem,
    });
    expect(projection.citationMap.map((entry) => entry.citationId)).toEqual(["c1", "c2"]);
    expect(projection.topStories[0]?.citationIds).toEqual(["c1"]);
    expect(projection.interestHighlights[0]?.citationIds).toEqual(["c1"]);
    expect(projection.repeatedSignals[0]?.citationIds).toEqual(["c1"]);
  });

  it("preserves first-evidence fallbacks and repeated-interest policy on missing cluster representatives", () => {
    const input = dailySynthesisReaderSummaryInput();
    const firstItem = input.evidence.selectedEvidence[0];
    const firstCluster = input.evidence.clusters[0];
    if (firstItem === undefined || firstCluster === undefined) {
      throw new Error("Projection fixture needs a cluster and evidence");
    }
    const missingRepresentative = {
      ...firstCluster,
      id: "story:missing-representative",
      representativeFeedItemId: "feed-not-selected",
      interestIds: ["interest-0", "interest-1"],
    };
    const projection = buildDeterministicReaderSummaryStoryProjection({
      input: {
        ...input,
        evidence: { ...input.evidence, clusters: [missingRepresentative] },
      },
      citedEvidence: input.evidence.selectedEvidence,
      selectedEvidence: [firstItem],
      topStoryClusters: [missingRepresentative],
      firstItem,
    });
    expect(projection.topStories[0]).toMatchObject({
      storyClusterId: missingRepresentative.id,
      title: firstItem.title,
      citationIds: ["c1"],
    });
    expect(projection.repeatedSignals).toEqual([{
      storyClusterId: missingRepresentative.id,
      title: firstItem.title,
      interestIds: ["interest-0", "interest-1"],
      citationIds: ["c1"],
    }]);
    expect(projection.interestHighlights).toHaveLength(1);

    const disabled = buildDeterministicReaderSummaryStoryProjection({
      input: {
        ...input,
        policy: {
          ...input.policy,
          includeInterestHighlights: false,
          includeRepeatedSignals: false,
        },
      },
      citedEvidence: input.evidence.selectedEvidence,
      selectedEvidence: [firstItem],
      topStoryClusters: [missingRepresentative],
      firstItem,
    });
    expect(disabled.interestHighlights).toEqual([]);
    expect(disabled.repeatedSignals).toEqual([]);
  });

  it("keeps deterministic document risk, confidence, citation identity and headline synchronized", async () => {
    const adapter = new DeterministicReaderSummaryModelAdapter();
    const input = dailySynthesisReaderSummaryInput();
    const selectedRoute: ReaderSummaryModelRoute = {
      provider: "deterministic-local",
      model: "deterministic-reader-summary-v1",
      promptVersion: "reader_summary.prompt.v1",
      schemaVersion: "reader_summary.artifact.v1",
    };
    const attempt = await adapter.generate(input, selectedRoute);

    expect(attempt.draft.risksAndUnknowns).toEqual([{
      description: "This deterministic reader summary only uses selected primary evidence titles.",
      citationIds: ["c1"],
      reason: "source_limit",
    }]);
    expect(attempt.draft.qualityFlags).toEqual([]);
    expect(attempt.draft.confidence).toEqual({
      level: "medium",
      score: 0.65,
      rationale: "Confidence is derived from selected primary evidence count in this deterministic adapter.",
    });
    expect(attempt.draft.content?.headline).toBe(attempt.draft.headline);
    expect(attempt.draft.lineage.promptVersion).toBe(selectedRoute.promptVersion);
    expect(attempt.draft.usage).toEqual(adapter.estimate(input, selectedRoute));
    expect(attempt.draft.citationMap[0]?.feedItemId)
      .toBe(input.evidence.selectedEvidence[0]?.feedItemId);
  });

  it("retains limited-source confidence and excludes disabled risks", async () => {
    const adapter = new DeterministicReaderSummaryModelAdapter();
    const original = readerSummaryInputForEvidence(
      readerSummaryEvidence([evidenceItem("hacker-news", 1, 3)]),
    );
    const input: ReaderSummaryModelInput = {
      ...original,
      policy: { ...original.policy, includeRisks: false },
    };
    const selectedRoute: ReaderSummaryModelRoute = {
      provider: "deterministic-local",
      model: "deterministic-reader-summary-v1",
      promptVersion: "reader_summary.prompt.v1",
      schemaVersion: "reader_summary.artifact.v1",
    };
    const attempt = await adapter.generate(input, selectedRoute);

    expect(attempt.draft.risksAndUnknowns).toEqual([]);
    expect(attempt.draft.qualityFlags).toEqual(["limited_sources"]);
    expect(attempt.draft.confidence).toMatchObject({ level: "low", score: 0.35 });
    expect(attempt.draft.content?.headline).toBe(attempt.draft.headline);
  });

  it("keeps trusted editorial slate evidence and cluster identity instead of re-ranking it", () => {
    const input = dailySynthesisReaderSummaryInput();
    const primary = primaryReaderSummaryEvidence(input.evidence);
    expect(input.evidence.editorialSlate).toBeDefined();
    const selected = selectDeterministicReaderSummaryCoverage(input, primary);
    expect(selected.selectedEvidence).toBe(primary.selectedEvidence);
    expect(selected.topStoryClusters).toBe(primary.clusters);
  });

  it("uses provider diversity and explicit coverage pins only without an editorial slate", () => {
    const original = dailySynthesisReaderSummaryInput();
    const input: ReaderSummaryModelInput = {
      ...original,
      evidence: { ...original.evidence, editorialSlate: undefined },
    };
    const primary = primaryReaderSummaryEvidence(input.evidence);
    const selected = selectDeterministicReaderSummaryCoverage(input, primary);
    expect(selected.selectedEvidence).toEqual(
      selectProviderDiverseRankedEvidence(primary.selectedEvidence, input.policy.maxStories),
    );
    const pinned = [
      ...(input.coveragePlan.lead === undefined ? [] : [input.coveragePlan.lead.clusterId]),
      ...input.coveragePlan.secondary.map((item) => item.clusterId),
    ];
    expect(selected.topStoryClusters.map((cluster) => cluster.id)).toEqual(
      selectClustersForEvidence(
        input.evidence.clusters,
        selected.selectedEvidence,
        input.policy.maxStories,
        pinned,
      ).map((cluster) => cluster.id),
    );
    expect(new Set(selected.topStoryClusters.map((cluster) => cluster.id)).size)
      .toBe(selected.topStoryClusters.length);
  });

});

const expectPublished = (
  input: ReaderSummaryModelInput,
  attempt: ProviderReaderSummaryAttempt,
): void => {
  const decision = publicationDecision(input, attempt);
  if (decision.status === "rejected") {
    throw new Error(decision.reasons.join("; "));
  }
  expect(decision).toMatchObject({
    status: "published",
    qualityPassed: true,
  });
};

const publicationDecision = (
  input: ReaderSummaryModelInput,
  attempt: ProviderReaderSummaryAttempt,
) => {
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
  return new ReaderSummaryPublicationPolicy().evaluate({
    artifact,
    evidence: input.evidence,
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

const readerSummaryInput = (sourceTitle: string): ReaderSummaryModelInput => {
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
    { ...evidenceItem("hacker-news", 10, 1.238), title: sourceTitle },
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
    selectedEvidence: selectedEvidence.map(acceptedDeterministicFixtureHeadline),
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
