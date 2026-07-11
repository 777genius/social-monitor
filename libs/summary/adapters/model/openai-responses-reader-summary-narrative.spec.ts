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
});

const normalize = (rawSections: readonly Record<string, unknown>[]) =>
  normalizeOpenAiReaderSummaryNarrative({
    rawSections,
    legacyExecutiveSummary: "Legacy summary",
    input: modelInput(),
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

const modelInput = (): ReaderSummaryModelInput =>
  ({
    evidence: {
      selectedEvidence: [],
      clusters: [],
    },
    coveragePlan: {
      lead: planItem("lead", "feed-lead", "lead"),
      secondary: [
        planItem("secondary", "feed-security", "security"),
        planItem("secondary", "feed-database", "database"),
      ],
    },
  }) as unknown as ReaderSummaryModelInput;

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
