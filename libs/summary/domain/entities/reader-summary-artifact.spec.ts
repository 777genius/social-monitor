import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  assertReaderSummaryCitationsAgainstEvidence,
  ReaderSummaryArtifact,
  type ReaderSummaryArtifactProps,
} from "./reader-summary-artifact";

const baseArtifact = (
  overrides: Partial<ReaderSummaryArtifactProps> = {},
): ReaderSummaryArtifactProps => ({
  schemaVersion: "reader_summary.artifact.v1",
  readerSummaryId: "reader-summary-1",
  tenantId: tenantId("tenant-reader-summary-artifact"),
  workspaceId: workspaceId("workspace-reader-summary-artifact"),
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-06-23T00:00:00.000Z"),
    endedAt: new Date("2026-06-24T00:00:00.000Z"),
    timezone: "UTC",
    periodKey:
      "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
  },
  sourceWindow: {
    windowId: "window-1",
    startedAt: new Date("2026-06-23T08:00:00.000Z"),
    endedAt: new Date("2026-06-23T09:00:00.000Z"),
    selectedFeedItemIds: ["feed-1"],
    storyClusterIds: ["story:one"],
  },
  storyClusters: [
    {
      id: "story:one",
      storyKey: "url:example.com/a",
      representativeFeedItemId: "feed-1",
      duplicateFeedItemIds: ["feed-2"],
      interestIds: ["interest-ai", "interest-github"],
      providerKeys: ["reddit", "github"],
      score: 2.4,
      observedAtRange: {
        startedAt: new Date("2026-06-23T08:10:00.000Z"),
        endedAt: new Date("2026-06-23T08:30:00.000Z"),
      },
      whyImportant: ["Repeated across monitored interests"],
    },
  ],
  contextArtifacts: [],
  headline: "AI tooling is trending across sources",
  executiveSummary:
    "The same AI tooling story appeared across several monitored surfaces.",
  topStories: [
    {
      storyClusterId: "story:one",
      title: "AI tooling is trending",
      summary: "One story is repeated across multiple interests.",
      interestIds: ["interest-ai", "interest-github"],
      providerKeys: ["reddit", "github"],
      citationIds: ["citation-1"],
    },
  ],
  interestHighlights: [],
  repeatedSignals: [
    {
      storyClusterId: "story:one",
      title: "Repeated across AI and GitHub interests",
      interestIds: ["interest-ai", "interest-github"],
      citationIds: ["citation-1"],
    },
  ],
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
    score: 0.64,
    rationale: "Direct source item citation with repeated interest coverage.",
  },
  lineage: {
    promptVersion: "reader-summary.prompt.v1",
    schemaVersion: "reader_summary.artifact.v1",
    modelVersion: "deterministic-reader-summary-v1",
    providerVersion: "deterministic-local",
    rulesVersion: "reader_summary.rules.policy.v1",
    evalDatasetVersion: "reader_summary.eval.v1",
  },
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    estimatedCostUsd: 0,
  },
  ...overrides,
});

const readerTopRead = (
  overrides: Partial<
    NonNullable<ReaderSummaryArtifactProps["content"]>["topReads"][number]
  > = {},
): NonNullable<ReaderSummaryArtifactProps["content"]>["topReads"][number] => ({
  title: "AI tooling is trending",
  providerKey: "reddit",
  providerName: "Reddit",
  primaryActionKind: "read_source",
  reason: "Repeated across monitored interests.",
  matchedInterestIds: ["interest-ai"],
  matchedRules: ["developer-tools"],
  signalScore: 0.91,
  confidence: {
    level: "medium",
    score: 0.72,
    rationale: "Direct citation backs the top read.",
  },
  confirmedProviderKeys: ["reddit"],
  providerMetrics: [],
  whyImportant: ["Repeated across monitored interests"],
  whyNow: "It appeared in the current monitoring window.",
  canonicalUrl: "https://reddit.com/r/OpenAI/comments/example",
  citationIds: ["citation-1"],
  ...overrides,
});

const readerContent = (
  overrides: Partial<NonNullable<ReaderSummaryArtifactProps["content"]>> = {},
): NonNullable<ReaderSummaryArtifactProps["content"]> => ({
  headline: "AI tooling is trending across sources",
  oneLineTakeaway: "One monitored story is worth reading now.",
  bullets: ["Repeated evidence points to a useful developer tooling signal."],
  qualityState: {
    status: "ready",
    flags: [],
    warnings: [],
    isSingleSource: false,
  },
  interestSections: [],
  sourceMix: [
    {
      providerKey: "reddit",
      itemCount: 1,
      citationCount: 1,
      storyClusterCount: 1,
      crossSourceClusterCount: 1,
      singleSourceOnly: false,
      interestIds: ["interest-ai"],
    },
  ],
  topReads: [readerTopRead()],
  trendDelta: {
    newSignals: [],
    growingSignals: ["AI tooling"],
    repeatedSignals: [],
    fadingSignals: [],
  },
  openQuestions: [],
  risks: [],
  nextActions: [],
  ...overrides,
});

describe("ReaderSummaryArtifact", () => {
  it("accepts a workspace reader summary with story clusters and feed citations", () => {
    expect(
      ReaderSummaryArtifact.create(baseArtifact()).toSnapshot(),
    ).toMatchObject({
      schemaVersion: "reader_summary.artifact.v1",
      readerSummaryId: "reader-summary-1",
      scope: { type: "workspace" },
      period: expect.objectContaining({ cadence: "daily" }),
      topStories: [
        expect.objectContaining({
          storyClusterId: "story:one",
          citationIds: ["citation-1"],
        }),
      ],
    });
  });

  it("rejects source windows outside the reader summary period", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          sourceWindow: {
            ...baseArtifact().sourceWindow,
            startedAt: new Date("2026-06-22T23:30:00.000Z"),
          },
        }),
      ),
    ).toThrow("Reader summary source window must stay inside period");
  });

  it("rejects top reads that cite outside the citation map", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          topStories: [
            {
              storyClusterId: "story:one",
              title: "Untrusted story",
              summary: "This cites a missing source.",
              interestIds: ["interest-ai"],
              providerKeys: ["reddit"],
              citationIds: ["missing-citation"],
            },
          ],
        }),
      ),
    ).toThrow("Reader summary top story cites evidence outside citation map");
  });

  it("rejects reader content top reads whose provider is not backed by citations", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          content: readerContent({
            topReads: [
              readerTopRead({
                providerKey: "github",
                providerName: "GitHub",
                confirmedProviderKeys: ["github"],
              }),
            ],
          }),
        }),
      ),
    ).toThrow(
      "Reader summary top read provider must match at least one citation",
    );
  });

  it("rejects reader content source mix providers outside selected evidence", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          content: readerContent({
            sourceMix: [
              ...readerContent().sourceMix,
              {
                providerKey: "x-twitter",
                itemCount: 1,
                citationCount: 0,
                storyClusterCount: 0,
                crossSourceClusterCount: 0,
                singleSourceOnly: true,
                interestIds: ["interest-ai"],
              },
            ],
          }),
        }),
      ),
    ).toThrow("Reader summary source mix includes provider outside evidence");
  });

  it("rejects duplicate reader content source mix providers", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          content: readerContent({
            sourceMix: [
              ...readerContent().sourceMix,
              {
                providerKey: "reddit",
                itemCount: 1,
                citationCount: 1,
                storyClusterCount: 1,
                crossSourceClusterCount: 1,
                singleSourceOnly: false,
                interestIds: ["interest-ai"],
              },
            ],
          }),
        }),
      ),
    ).toThrow("Reader summary source mix provider keys must be unique");
  });

  it("rejects reader content with signal but no top reads", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          content: readerContent({
            topReads: [],
          }),
        }),
      ),
    ).toThrow("Reader summary content with signal must include top reads");
  });

  it("rejects no-signal reader content that still includes top reads", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          content: readerContent({
            qualityState: {
              status: "no_signal",
              flags: ["no_signal"],
              warnings: ["No cited source evidence passed selection."],
              isSingleSource: false,
            },
          }),
        }),
      ),
    ).toThrow("No-signal reader summary content must not include top reads");
  });

  it("rejects duplicate reader content top reads by normalized repository URL", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          content: readerContent({
            topReads: [
              readerTopRead({
                title: "openai/codex",
                canonicalUrl: "https://github.com/openai/codex",
              }),
              readerTopRead({
                title: "OpenAI Codex repo",
                canonicalUrl:
                  "https://github.com/OpenAI/Codex/stargazers?utm_source=reddit#readme",
              }),
            ],
          }),
        }),
      ),
    ).toThrow("Reader summary top reads must not repeat the same reader item");
  });

  it("rejects duplicate reader content top reads by citation repository URL", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          storyClusters: [
            {
              ...baseArtifact().storyClusters[0]!,
              providerKeys: ["github-repo-radar"],
            },
          ],
          citationMap: [
            {
              citationId: "citation-1",
              feedItemId: "feed-1",
              sourceItemId: "source-1",
              providerKey: "github-repo-radar",
              field: "title",
              canonicalUrl: "https://github.com/openai/codex",
            },
            {
              citationId: "citation-2",
              feedItemId: "feed-2",
              sourceItemId: "source-2",
              providerKey: "github-repo-radar",
              field: "bodyPreview",
              canonicalUrl:
                "https://github.com/OpenAI/Codex/stargazers?utm_source=readerSummary",
            },
          ],
          content: readerContent({
            sourceMix: [
              {
                providerKey: "github-repo-radar",
                itemCount: 2,
                citationCount: 2,
                storyClusterCount: 1,
                crossSourceClusterCount: 1,
                singleSourceOnly: false,
                interestIds: ["interest-ai"],
              },
            ],
            topReads: [
              readerTopRead({
                title: "openai/codex growth",
                providerKey: "github-repo-radar",
                providerName: "GitHub Repo Radar",
                confirmedProviderKeys: ["github-repo-radar"],
                canonicalUrl: undefined,
                citationIds: ["citation-1"],
              }),
              readerTopRead({
                title: "Codex stargazers jump",
                providerKey: "github-repo-radar",
                providerName: "GitHub Repo Radar",
                confirmedProviderKeys: ["github-repo-radar"],
                canonicalUrl: undefined,
                citationIds: ["citation-2"],
              }),
            ],
          }),
        }),
      ),
    ).toThrow("Reader summary top reads must not repeat the same reader item");
  });

  it("rejects repeated reader content interest section items", () => {
    const repeatedItem = readerTopRead({
      title: "openai/codex",
      canonicalUrl: "https://github.com/openai/codex",
    });

    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          content: readerContent({
            interestSections: [
              {
                interestId: "interest-ai",
                title: "AI tooling",
                insight: "Codex is the strongest AI tooling read.",
                items: [repeatedItem],
                citationIds: ["citation-1"],
              },
              {
                interestId: "interest-devtools",
                title: "Developer tooling",
                insight: "The same repo must not be repeated as a new card.",
                items: [
                  {
                    ...repeatedItem,
                    canonicalUrl:
                      "https://github.com/OpenAI/Codex?ref=interest-section",
                  },
                ],
                citationIds: ["citation-1"],
              },
            ],
          }),
        }),
      ),
    ).toThrow(
      "Reader summary interest sections must not repeat the same reader item",
    );
  });

  it("rejects repeated reader content across top reads and interest sections", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          content: readerContent({
            topReads: [
              readerTopRead({
                title: "openai/codex",
                canonicalUrl: "https://github.com/openai/codex",
              }),
            ],
            interestSections: [
              {
                interestId: "interest-ai",
                title: "AI tooling",
                insight: "Codex is the strongest AI tooling read.",
                items: [
                  readerTopRead({
                    title: "OpenAI Codex repo",
                    canonicalUrl:
                      "https://github.com/OpenAI/Codex?utm_source=interest",
                  }),
                ],
                citationIds: ["citation-1"],
              },
            ],
          }),
        }),
      ),
    ).toThrow("Reader summary content must not repeat the same reader item");
  });

  it("rejects model citations outside selected primary evidence", () => {
    expect(() =>
      assertReaderSummaryCitationsAgainstEvidence(
        {
          citationMap: [
            {
              citationId: "citation-1",
              feedItemId: "feed-outside",
              sourceItemId: "source-outside",
              providerKey: "reddit",
              field: "title",
            },
          ],
          topStories: [],
          interestHighlights: [],
          repeatedSignals: [],
          risksAndUnknowns: [],
        },
        {
          rankingPolicyVersion: "story_ranking_v1",
          sourceWindow: {
            windowId: "window-1",
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T09:00:00.000Z"),
            selectedFeedItemIds: ["feed-1"],
            storyClusterIds: ["story:one"],
          },
          clusters: [],
          selectedEvidence: [],
        },
      ),
    ).toThrow(
      "Reader summary citation citation-1 references evidence outside selection",
    );
  });
});
