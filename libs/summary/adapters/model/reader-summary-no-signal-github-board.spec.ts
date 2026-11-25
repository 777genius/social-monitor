import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  assertReaderSummaryCitationsAgainstEvidence,
  primaryReaderSummaryEvidence,
  readerSummaryHasNoPrimaryGitHubEvidence,
  readerSummaryRequiresGitHubProjection,
  ReaderSummaryArtifact,
  ReaderSummaryPublicationPolicy,
  buildReaderSummaryCoveragePlan,
  type SummaryEvidenceSelection,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryModelInput,
  ReaderSummaryModelPort,
} from "../../ports";
import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import { DeterministicReaderSummaryModelAdapter } from "./deterministic-reader-summary-model.adapter";
import { OpenAiResponsesReaderSummaryModelAdapter } from "./openai-responses-reader-summary-model.adapter";

describe("reader summary GitHub-only no-signal model fallback", () => {
  it("builds the canonical board without invoking agent-runtime", async () => {
    let called = false;
    const client: AgentRuntimeClientPort = {
      runTask: async () => {
        called = true;
        throw new Error("Agent runtime must not run without primary evidence");
      },
      checkHealth: async () => ({
        status: "serving",
        runtimeEngine: "test",
        runtimeVersion: "test",
        warnings: [],
      }),
    };

    await expectCanonicalGitHubOnlyNoSignalArticle(
      new AgentRuntimeReaderSummaryModelAdapter({ client }),
    );

    expect(called).toBe(false);
  });

  it("builds the canonical board without invoking OpenAI", async () => {
    let called = false;
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
      fetchFn: async () => {
        called = true;
        throw new Error("OpenAI must not run without primary evidence");
      },
    });

    await expectCanonicalGitHubOnlyNoSignalArticle(adapter);

    expect(called).toBe(false);
  });

  it("builds the canonical board in deterministic mode", async () => {
    await expectCanonicalGitHubOnlyNoSignalArticle(
      new DeterministicReaderSummaryModelAdapter(),
    );
  });
});

const expectCanonicalGitHubOnlyNoSignalArticle = async (
  adapter: ReaderSummaryModelPort,
): Promise<void> => {
  const input = githubOnlyReaderSummaryInput();
  const route = adapter.route(
    input,
    {
      preferredProvider: "test",
      maxInputTokens: 24_000,
      maxOutputTokens: 16_000,
      maxEstimatedCostUsd: 1,
    },
    { remainingTokens: 40_000, remainingCostUsd: 1 },
  );

  const attempt = await adapter.generate(input, route);
  expect(attempt.draft.citationMap).toEqual(
    input.evidence.selectedEvidence.map((item, index) => ({
      citationId: `c${index + 1}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: "github-trending-page",
      field: "canonicalUrl",
      canonicalUrl: item.canonicalUrl,
    })),
  );
  expect(attempt.draft.headline).toBe("No reliable workspace signal yet");
  expect(attempt.draft.executiveSummary).not.toContain("repository-");
  expect(attempt.draft.qualityFlags).toEqual([
    "no_signal",
    "limited_sources",
  ]);

  const content = attempt.draft.content;
  expect(content).toBeDefined();
  expect(content?.qualityState.status).toBe("no_signal");
  expect(content?.topReads).toEqual([]);
  expect(content?.sourceMix).toEqual([]);
  expect(content?.mainTopics).toEqual([]);
  expect(content?.claimBoard).toEqual([]);
  expect(content?.narrativeSections).toEqual([
    expect.objectContaining({
      id: "github-trending",
      kind: "watch",
      title: "GitHub Trending",
      citationIds: ["c1", "c2", "c3"],
    }),
  ]);
  expect(content?.selectedPosts).toHaveLength(10);
  expect(content?.selectedPosts?.map((post) => post.title)).toEqual(
    Array.from(
      { length: 10 },
      (_, index) => `example/repository-${index + 1}`,
    ),
  );
  expect(content?.selectedPosts?.map((post) => post.citationIds)).toEqual(
    Array.from({ length: 10 }, (_, index) => [`c${index + 1}`]),
  );

  assertReaderSummaryCitationsAgainstEvidence(attempt.draft, input.evidence);
  const artifact = ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: "reader-summary-github-only-no-signal",
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    scope: input.scope,
    period: input.period,
    generatedAt: new Date("2026-07-17T00:00:24.435Z"),
    sourceWindow: input.evidence.sourceWindow,
    storyClusters: input.evidence.clusters,
    contextArtifacts: [],
    ...attempt.draft,
  });
  expect(readerSummaryHasNoPrimaryGitHubEvidence(artifact)).toBe(true);
  expect(readerSummaryRequiresGitHubProjection(artifact)).toBe(true);
  expect(
    new ReaderSummaryPublicationPolicy().evaluate({
      artifact,
      evidence: input.evidence,
    }),
  ).toMatchObject({ status: "published", qualityPassed: true });
  expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
};

const githubOnlyReaderSummaryInput = (): ReaderSummaryModelInput => {
  const publishedAt = new Date("2026-07-16T23:59:59.999Z");
  const observedAt = new Date("2026-07-17T00:00:24.435Z");
  const selectedEvidence = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return {
      feedItemId: `github-feed-${rank}`,
      sourceItemId: `github-source-${rank}`,
      sourceBindingId: "github-binding",
      interestId: "interest-github",
      providerKey: "github-trending-page",
      providerName: "GitHub Trending",
      canonicalUrl: `https://github.com/example/repository-${rank}`,
      title: `example/repository-${rank}`,
      bodyPreview: `Repository ${rank} appears on the canonical daily board.`,
      publishedAt,
      observedAt,
      score: 2_100 - rank,
      whyImportant: ["Canonical GitHub daily rank"],
      providerMetricLabels: [
        {
          label: "GitHub Trending today",
          value: `#${rank} · +${2_000 + rank} stars today`,
        },
      ],
      contentQuality: {
        qualityScore: 1,
        interestRelevanceScore: 1,
        engagementIntegrityScore: 1,
        eligibleForSummary: true,
        eligibleForTopRead: true,
        needsLlmReview: false,
        decision: "include",
        flags: [],
        reason: "Canonical GitHub daily board entry",
      },
      readerActionKind: "watch_repository" as const,
    };
  });
  const evidence: SummaryEvidenceSelection = {
    rankingPolicyVersion: "story_ranking_v1",
    sourceWindow: {
      windowId: "workspace:github-only:2026-07-16",
      startedAt: new Date("2026-07-16T00:00:00.000Z"),
      endedAt: publishedAt,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: [],
    },
    clusters: [],
    selectedEvidence,
  };

  return {
    tenantId: tenantId("tenant-github-only-no-signal"),
    workspaceId: workspaceId("workspace-github-only-no-signal"),
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: new Date("2026-07-16T00:00:00.000Z"),
      endedAt: new Date("2026-07-17T00:00:00.000Z"),
      timezone: "UTC",
      periodKey:
        "daily:2026-07-16T00:00:00.000Z:2026-07-17T00:00:00.000Z:UTC",
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
    requestedAt: new Date("2026-07-17T00:00:24.278Z"),
  };
};
