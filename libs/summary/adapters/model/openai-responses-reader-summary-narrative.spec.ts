import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeOpenAiReaderSummaryNarrative } from "./openai-responses-reader-summary-narrative";

describe("normalizeOpenAiReaderSummaryNarrative", () => {
  it("requires structured narrative when secondary signals are planned", () => {
    expect(() =>
      normalizeOpenAiReaderSummaryNarrative({
        rawSections: undefined,
        legacyExecutiveSummary: "Legacy summary",
        input: modelInput(),
        citationMap: citations,
        storyTitlesByClusterId: new Map(),
        storySummariesByClusterId: new Map(),
        storySummariesByCitationId: new Map(),
      }),
    ).toThrow("planned cited lead and secondary signals");
  });

  it("rejects duplicate secondary sections that omit a planned cluster", () => {
    expect(() =>
      normalize([
        section("lead", "lead", "c1"),
        section("secondary_signal", "security", "c2"),
        section("secondary_signal", "security", "c2"),
      ]),
    ).toThrow("missing=database, duplicated=security");
  });

  it("accepts exactly one cited section for every planned story", () => {
    const result = normalize([
      section("lead", "lead", "c1"),
      section("secondary_signal", "security", "c2"),
      section("secondary_signal", "database", "c3"),
    ]);

    expect(result.map((item) => [item.kind, item.storyClusterId])).toEqual([
      ["lead", "lead"],
      ["secondary_signal", "security"],
      ["secondary_signal", "database"],
    ]);
  });

  it("binds a lead section to the planned cluster when the model omits it", () => {
    const result = normalize([
      {
        kind: "lead",
        title: "Planned lead",
        text: "The planned lead explains the primary signal.",
        citationIds: ["c1"],
      },
      section("secondary_signal", "security", "c2"),
      section("secondary_signal", "database", "c3"),
    ]);

    expect(result[0]).toMatchObject({
      kind: "lead",
      storyClusterId: "lead",
    });
  });

  it("binds a promoted main signal to the planned lead cluster", () => {
    const result = normalize([
      {
        kind: "main_signal",
        title: "Main signal",
        text: "The planned lead explains the primary signal.",
        citationIds: ["c1"],
      },
      section("secondary_signal", "security", "c2"),
      section("secondary_signal", "database", "c3"),
    ]);

    expect(result[0]).toMatchObject({
      kind: "lead",
      title: "Lead",
      storyClusterId: "lead",
    });
  });

  it("rejects promotion of a main signal with mixed citations", () => {
    expect(() =>
      normalize([
        {
          kind: "main_signal",
          title: "Mixed signal",
          text: "This section mixes the lead with a secondary story.",
          citationIds: ["c1", "c2"],
        },
        section("secondary_signal", "security", "c2"),
        section("secondary_signal", "database", "c3"),
      ]),
    ).toThrow("must include a cited lead");
  });

  it("rejects promotion of a main signal bound to another cluster", () => {
    expect(() =>
      normalize([
        section("main_signal", "security", "c1"),
        section("secondary_signal", "security", "c2"),
        section("secondary_signal", "database", "c3"),
      ]),
    ).toThrow("must include a cited lead");
  });

  it("binds the fallback narrative to the planned lead cluster", () => {
    const input = modelInput();
    const result = normalizeOpenAiReaderSummaryNarrative({
      rawSections: undefined,
      legacyExecutiveSummary: "Legacy summary",
      input: {
        ...input,
        coveragePlan: { ...input.coveragePlan, secondary: [] },
      },
      citationMap: citations,
      storyTitlesByClusterId: new Map([["lead", "Lead"]]),
      storySummariesByClusterId: new Map(),
      storySummariesByCitationId: new Map(),
    });

    expect(result[0]).toMatchObject({
      kind: "lead",
      title: "Lead",
      storyClusterId: "lead",
    });
  });

  it("rejects an explicit lead cluster that disagrees with the plan", () => {
    expect(() =>
      normalize([
        section("lead", "wrong-lead", "c1"),
        section("secondary_signal", "security", "c2"),
        section("secondary_signal", "database", "c3"),
      ]),
    ).toThrow("must include a cited lead");
  });

  it("rejects a lead section that mixes planned and secondary citations", () => {
    expect(() =>
      normalize([
        {
          ...section("lead", "lead", "c1"),
          citationIds: ["c1", "c2"],
        },
        section("secondary_signal", "security", "c2"),
        section("secondary_signal", "database", "c3"),
      ]),
    ).toThrow("must include a cited lead");
  });

  it("accepts a multi-cluster synthesis lead without binding it to one story", () => {
    const input = modelInput();
    const result = normalize(
      [
        {
          ...section("lead", "lead", "c1"),
          title: "Daily synthesis",
          citationIds: ["c1", "c2"],
        },
        section("secondary_signal", "security", "c2"),
        section("secondary_signal", "database", "c3"),
      ],
      {
        ...input,
        coveragePlan: { ...input.coveragePlan, mode: "daily_synthesis" },
      },
    );

    expect(result[0]).toMatchObject({
      kind: "lead",
      citationIds: ["c1", "c2"],
    });
    expect(result[0]?.storyClusterId).toBeUndefined();
  });

  it("rejects a daily synthesis lead backed by only one planned cluster", () => {
    const input = modelInput();

    expect(() =>
      normalize(
        [
          section("lead", "lead", "c1"),
          section("secondary_signal", "security", "c2"),
          section("secondary_signal", "database", "c3"),
        ],
        {
          ...input,
          coveragePlan: { ...input.coveragePlan, mode: "daily_synthesis" },
        },
      ),
    ).toThrow("must include a cited lead");
  });

  it("drops watch sections without eligible supporting evidence", () => {
    const result = normalize([
      section("lead", "lead", "c1"),
      section("secondary_signal", "security", "c2"),
      section("secondary_signal", "database", "c3"),
      section("watch", "weak-rumor", "c1"),
    ]);

    expect(result.some((item) => item.kind === "watch")).toBe(false);
  });

  it("keeps a self-contained high-engagement watch", () => {
    const result = normalize(
      [
        section("lead", "lead", "c1"),
        section("secondary_signal", "security", "c2"),
        section("secondary_signal", "database", "c3"),
        section("watch", "emerging", "c4"),
      ],
      modelInput([strongWatchEvidence]),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "watch", citationIds: ["c4"] }),
      ]),
    );
  });

  it("drops a watch when any cited evidence is ineligible", () => {
    const result = normalize(
      [
        section("lead", "lead", "c1"),
        section("secondary_signal", "security", "c2"),
        section("secondary_signal", "database", "c3"),
        {
          ...section("watch", "emerging", "c4"),
          citationIds: ["c4", "c5"],
        },
      ],
      modelInput([strongWatchEvidence, weakWatchEvidence]),
    );

    expect(result.some((item) => item.kind === "watch")).toBe(false);
  });

  it("does not treat an RSS mirror as independent cross-provider support", () => {
    const result = normalize(
      [
        section("lead", "lead", "c1"),
        section("secondary_signal", "security", "c2"),
        section("secondary_signal", "database", "c3"),
        {
          ...section("watch", "mirrored", "c4"),
          citationIds: ["c4", "c6"],
        },
      ],
      modelInput(
        [lowEngagementWatchEvidence, rssMirrorWatchEvidence],
        [mirrorCluster],
      ),
    );

    expect(result.some((item) => item.kind === "watch")).toBe(false);
  });
});

const normalize = (
  rawSections: readonly Record<string, unknown>[],
  input = modelInput(),
) =>
  normalizeOpenAiReaderSummaryNarrative({
    rawSections,
    legacyExecutiveSummary: "Legacy summary",
    input,
    citationMap: citations,
    storyTitlesByClusterId: new Map([
      ["lead", "Lead"],
      ["security", "Security"],
      ["database", "Database"],
    ]),
    storySummariesByClusterId: new Map(),
    storySummariesByCitationId: new Map(),
  });

const section = (kind: string, storyClusterId: string, citationId: string) => ({
  kind,
  storyClusterId,
  title: storyClusterId,
  text: `${storyClusterId} signal with concrete context`,
  citationIds: [citationId],
});

const citations: readonly ReaderSummaryCitation[] = [
  citation("c1", "feed-lead"),
  citation("c2", "feed-security"),
  citation("c3", "feed-database"),
  citation("c4", "feed-watch"),
  citation("c5", "feed-weak-watch"),
  citation("c6", "feed-rss-mirror"),
];

function citation(
  citationId: string,
  feedItemId: string,
): ReaderSummaryCitation {
  return {
    citationId,
    feedItemId,
    sourceItemId: `source-${feedItemId}`,
    providerKey: "rss",
    field: "title",
    canonicalUrl: `https://example.test/${feedItemId}`,
  };
}

const modelInput = (
  selectedEvidence: readonly Record<string, unknown>[] = [],
  clusters: readonly Record<string, unknown>[] = [],
): ReaderSummaryModelInput =>
  ({
    evidence: {
      selectedEvidence,
      clusters,
    },
    coveragePlan: {
      mode: "single_story",
      lead: planItem("lead", "feed-lead", "lead"),
      secondary: [
        planItem("secondary", "feed-security", "security"),
        planItem("secondary", "feed-database", "database"),
      ],
    },
  }) as unknown as ReaderSummaryModelInput;

const strongWatchEvidence = {
  feedItemId: "feed-watch",
  sourceItemId: "source-watch",
  sourceBindingId: "binding-watch",
  interestId: "interest-ai",
  providerKey: "hacker-news",
  canonicalUrl: "https://news.ycombinator.com/item?id=4",
  title: "Developers test a new coding-agent routing workflow",
  bodyPreview:
    "The discussion explains the complete setup, its trade-offs, and why engineering teams are evaluating the workflow now.",
  publishedAt: new Date("2026-07-12T12:00:00.000Z"),
  observedAt: new Date("2026-07-12T12:05:00.000Z"),
  score: 1.8,
  whyImportant: ["Relevant emerging workflow"],
  providerMetricLabels: [
    { label: "Points", value: "30" },
    { label: "Comments", value: "10" },
  ],
  contentQuality: {
    qualityScore: 0.8,
    interestRelevanceScore: 0.8,
    engagementIntegrityScore: 0.8,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "eligible",
    flags: [],
    reason: "Relevant evidence",
  },
};

const weakWatchEvidence = {
  ...strongWatchEvidence,
  feedItemId: "feed-weak-watch",
  sourceItemId: "source-weak-watch",
  sourceBindingId: "binding-weak-watch",
  title: "A short emerging claim",
  bodyPreview: "A fragment that does not explain the claim...",
  providerMetricLabels: [
    { label: "Points", value: "3" },
    { label: "Comments", value: "1" },
  ],
};

const lowEngagementWatchEvidence = {
  ...strongWatchEvidence,
  sourceOriginUrl: "https://example.test/original-story",
  providerMetricLabels: [
    { label: "Points", value: "3" },
    { label: "Comments", value: "1" },
  ],
};

const rssMirrorWatchEvidence = {
  ...lowEngagementWatchEvidence,
  feedItemId: "feed-rss-mirror",
  sourceItemId: "source-rss-mirror",
  sourceBindingId: "binding-rss-mirror",
  providerKey: "rss",
  canonicalUrl: "https://news.ycombinator.com/item?id=4",
  providerMetricLabels: [],
};

const mirrorCluster = {
  id: "mirrored",
  storyKey: "mirrored-story",
  representativeFeedItemId: "feed-watch",
  duplicateFeedItemIds: ["feed-rss-mirror"],
  interestIds: ["interest-ai"],
  providerKeys: ["hacker-news", "rss"],
  score: 1.8,
  observedAtRange: {
    startedAt: new Date("2026-07-12T12:00:00.000Z"),
    endedAt: new Date("2026-07-12T12:05:00.000Z"),
  },
  whyImportant: ["Relevant emerging workflow"],
};

const planItem = (
  role: "lead" | "secondary",
  feedItemId: string,
  clusterId: string,
) => ({
  role,
  clusterId,
  score: 2,
  feedItemIds: [feedItemId],
  providerKeys: ["rss"],
  interestIds: ["interest-ai"],
  whyImportant: ["Relevant today"],
});
