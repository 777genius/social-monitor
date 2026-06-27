import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  ReaderSummaryArtifact,
  type ReaderSummaryArtifactProps,
  type ReaderSummaryContextArtifact,
  type ReaderSummaryPeriod,
} from "../../domain";
import { InMemoryReaderSummaryArtifactRepository } from "../persistence/in-memory-reader-summary-artifact.repository";
import { ReaderSummaryArtifactContextProvider } from "./reader-summary-artifact-context.provider";

const tenant = tenantId("tenant-reader-summary-context");
const workspace = workspaceId("workspace-reader-summary-context");
const scope = { type: "workspace" } as const;

describe("ReaderSummaryArtifactContextProvider", () => {
  it("adds daily artifacts as context for weekly reader summaries", async () => {
    const repository = new InMemoryReaderSummaryArtifactRepository();
    await repository.save(
      artifact({
        readerSummaryId: "daily-context-1",
        period: period(
          "daily",
          "2026-06-16T00:00:00.000Z",
          "2026-06-17T00:00:00.000Z",
        ),
        executiveSummary: "Daily signal inside the weekly period.",
      }),
    );
    await repository.save(
      artifact({
        readerSummaryId: "daily-context-outside",
        period: period(
          "daily",
          "2026-06-22T00:00:00.000Z",
          "2026-06-23T00:00:00.000Z",
        ),
        executiveSummary: "Daily signal outside the weekly period.",
      }),
    );

    const context = await new ReaderSummaryArtifactContextProvider(
      repository,
    ).buildContext({
      tenantId: tenant,
      workspaceId: workspace,
      scope,
      period: period(
        "weekly",
        "2026-06-15T00:00:00.000Z",
        "2026-06-22T00:00:00.000Z",
      ),
      evidence: emptyEvidence(),
      requestedAt: new Date("2026-06-22T00:01:00.000Z"),
    });

    expect(context.map((item) => item.artifactId)).toEqual(["daily-context-1"]);
    expect(context[0]).toEqual(
      expect.objectContaining({
        period: expect.objectContaining({ cadence: "daily" }),
        summaryText: "Daily signal inside the weekly period.",
      }),
    );
  });

  it("adds weekly artifacts as context for monthly reader summaries and dedupes delegate artifacts", async () => {
    const repository = new InMemoryReaderSummaryArtifactRepository();
    await repository.save(
      artifact({
        readerSummaryId: "weekly-context-1",
        period: period(
          "weekly",
          "2026-06-15T00:00:00.000Z",
          "2026-06-22T00:00:00.000Z",
        ),
        executiveSummary: "Weekly signal inside the monthly period.",
      }),
    );
    await repository.save(
      artifact({
        readerSummaryId: "daily-context-ignored",
        period: period(
          "daily",
          "2026-06-16T00:00:00.000Z",
          "2026-06-17T00:00:00.000Z",
        ),
        executiveSummary:
          "Daily signal should not be used for monthly context.",
      }),
    );

    const context = await new ReaderSummaryArtifactContextProvider(repository, {
      async buildContext() {
        return [
          {
            artifactId: "weekly-context-1",
            scope,
            period: period(
              "weekly",
              "2026-06-15T00:00:00.000Z",
              "2026-06-22T00:00:00.000Z",
            ),
            summaryText: "Duplicate delegate context.",
            generatedAt: new Date("2026-06-22T00:00:00.000Z"),
            freshness: "unknown",
          },
          {
            artifactId: "memory-context-1",
            scope,
            period: period(
              "daily",
              "2026-06-30T00:00:00.000Z",
              "2026-07-01T00:00:00.000Z",
            ),
            summaryText: "Memory context.",
            generatedAt: new Date("2026-07-01T00:00:00.000Z"),
            freshness: "fresh",
          },
        ] satisfies ReaderSummaryContextArtifact[];
      },
    }).buildContext({
      tenantId: tenant,
      workspaceId: workspace,
      scope,
      period: period(
        "monthly",
        "2026-06-01T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z",
      ),
      evidence: emptyEvidence(),
      requestedAt: new Date("2026-07-01T00:01:00.000Z"),
    });

    expect(context.map((item) => item.artifactId)).toEqual([
      "weekly-context-1",
      "memory-context-1",
    ]);
    expect(context[0]?.summaryText).toBe(
      "Weekly signal inside the monthly period.",
    );
  });

  it("does not add period artifact context for daily reader summaries", async () => {
    const repository = new InMemoryReaderSummaryArtifactRepository();
    await repository.save(
      artifact({
        readerSummaryId: "daily-context-ignored",
        period: period(
          "daily",
          "2026-06-23T00:00:00.000Z",
          "2026-06-24T00:00:00.000Z",
        ),
      }),
    );

    const context = await new ReaderSummaryArtifactContextProvider(
      repository,
    ).buildContext({
      tenantId: tenant,
      workspaceId: workspace,
      scope,
      period: period(
        "daily",
        "2026-06-24T00:00:00.000Z",
        "2026-06-25T00:00:00.000Z",
      ),
      evidence: emptyEvidence(),
      requestedAt: new Date("2026-06-25T00:01:00.000Z"),
    });

    expect(context).toEqual([]);
  });
});

const period = (
  cadence: ReaderSummaryPeriod["cadence"],
  startedAt: string,
  endedAt: string,
): ReaderSummaryPeriod => ({
  cadence,
  startedAt: new Date(startedAt),
  endedAt: new Date(endedAt),
  timezone: "UTC",
  periodKey: `${cadence}:${startedAt}:${endedAt}:UTC`,
});

const artifact = (
  overrides: Partial<ReaderSummaryArtifactProps> = {},
): ReaderSummaryArtifact => {
  const artifactPeriod =
    overrides.period ??
    period("daily", "2026-06-23T00:00:00.000Z", "2026-06-24T00:00:00.000Z");
  const sourceWindowStartedAt = new Date(
    artifactPeriod.startedAt.getTime() + 60_000,
  );
  const sourceWindowEndedAt = new Date(
    artifactPeriod.startedAt.getTime() + 120_000,
  );

  return ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: "reader-summary-context-artifact",
    tenantId: tenant,
    workspaceId: workspace,
    scope,
    period: artifactPeriod,
    sourceWindow: {
      windowId: "reader-summary-context-window",
      startedAt: sourceWindowStartedAt,
      endedAt: sourceWindowEndedAt,
      selectedFeedItemIds: ["feed-1"],
      storyClusterIds: ["story-1"],
    },
    storyClusters: [
      {
        id: "story-1",
        storyKey: "url:example.test/story",
        representativeFeedItemId: "feed-1",
        duplicateFeedItemIds: [],
        topicIds: ["topic-ai"],
        providerKeys: ["reddit"],
        score: 1,
        observedAtRange: {
          startedAt: sourceWindowStartedAt,
          endedAt: sourceWindowEndedAt,
        },
        whyImportant: ["Fixture context story."],
      },
    ],
    contextArtifacts: [],
    headline: "Reader summary context fixture",
    executiveSummary: "Reader summary context fixture.",
    topStories: [
      {
        storyClusterId: "story-1",
        title: "Reader summary context fixture",
        summary: "Fixture story.",
        topicIds: ["topic-ai"],
        providerKeys: ["reddit"],
        citationIds: ["citation-1"],
      },
    ],
    topicHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [
      {
        citationId: "citation-1",
        feedItemId: "feed-1",
        sourceItemId: "source-1",
        providerKey: "reddit",
        field: "title",
      },
    ],
    qualityFlags: [],
    confidence: {
      level: "medium",
      score: 0.7,
      rationale: "Fixture confidence.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.context-test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "deterministic-reader-summary-v1",
      providerVersion: "deterministic-local",
      rulesVersion: "reader_summary.rules.context-test.v1",
      evalDatasetVersion: "reader_summary.eval.context-test.v1",
    },
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: 0,
    },
    ...overrides,
  });
};

const emptyEvidence = () => ({
  sourceWindow: {
    windowId: "empty-evidence-window",
    startedAt: new Date("2026-06-23T08:00:00.000Z"),
    endedAt: new Date("2026-06-23T08:01:00.000Z"),
    selectedFeedItemIds: [],
    storyClusterIds: [],
  },
  selectedEvidence: [],
  clusters: [],
  rankingPolicyVersion: "story_ranking_v1",
});
