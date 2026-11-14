import type { ReaderSummaryCoveragePlanItem } from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelInput,
} from "../../ports";
import { buildDeterministicReaderSummaryNarrative } from "./deterministic-reader-summary-narrative";

type DraftCitation =
  ProviderReaderSummaryAttempt["draft"]["citationMap"][number];

describe("buildDeterministicReaderSummaryNarrative", () => {
  it("reserves a rare provider citation for a mixed lead cluster", () => {
    const lead = planItem("lead", ["lead-hn", "lead-rss"], [
      "hacker-news",
      "rss",
    ]);
    const secondary = [1, 2, 3].map((index) =>
      planItem(
        `secondary-${index}`,
        [`secondary-${index}-hn`],
        ["hacker-news"],
      ),
    );
    const citationMap = [
      citation("c1", "lead-hn", "hacker-news"),
      citation("c2", "lead-rss", "rss"),
      ...secondary.map((item, index) =>
        citation(`c${index + 3}`, item.feedItemIds[0]!, "hacker-news"),
      ),
    ];

    const sections = buildDeterministicReaderSummaryNarrative({
      input: {
        coveragePlan: {
          mode: "daily_synthesis",
          lead,
          secondary,
        },
      } as unknown as ReaderSummaryModelInput,
      executiveSummary: "A provider-diverse daily synthesis.",
      citationMap,
      topStories: [],
    });
    const leadSection = sections.find((section) => section.kind === "lead");
    const providersByCitationId = new Map(
      citationMap.map((item) => [item.citationId, item.providerKey] as const),
    );
    const leadProviders = new Set(
      (leadSection?.citationIds ?? []).map((citationId) =>
        providersByCitationId.get(citationId),
      ),
    );

    expect(leadSection?.citationIds).toEqual(["c2", "c3", "c4", "c5"]);
    expect(leadProviders).toEqual(new Set(["rss", "hacker-news"]));
    expect(
      sections
        .filter((section) => section.kind === "secondary_signal")
        .map((section) => section.citationIds),
    ).toEqual([["c3"], ["c4"], ["c5"]]);
  });

  it("keeps secondary order, selected story copy and strictly grounded citations", () => {
    const lead = planItem("lead", ["lead-feed"], ["rss"]);
    const secondary = [
      planItem("secondary-1", ["feed-1"], ["rss"]),
      planItem("secondary-2", ["feed-2"], ["rss"]),
      { ...planItem("secondary-3", ["feed-3"], ["rss"]), whyImportant: [] },
    ];
    const sections = buildDeterministicReaderSummaryNarrative({
      input: {
        coveragePlan: { mode: "daily_synthesis", lead, secondary },
      } as unknown as ReaderSummaryModelInput,
      executiveSummary: "A concise synthetic lead.",
      citationMap: [citation("trusted-citation", "feed-1", "rss")],
      topStories: [
        {
          storyClusterId: "secondary-1",
          title: "Selected top-story title",
          summary: "Selected top-story summary",
        },
      ] as unknown as ProviderReaderSummaryAttempt["draft"]["topStories"],
    });

    expect(sections.slice(1)).toEqual([
      {
        id: "narrative-deterministic-secondary-1",
        kind: "secondary_signal",
        title: "Selected top-story title",
        text: "Selected top-story summary",
        citationIds: ["trusted-citation"],
        storyClusterId: "secondary-1",
      },
      {
        id: "narrative-deterministic-secondary-2",
        kind: "secondary_signal",
        title: "Additional monitored signal 2",
        text: "Relevant monitored signal",
        citationIds: [],
        storyClusterId: "secondary-2",
      },
      {
        id: "narrative-deterministic-secondary-3",
        kind: "secondary_signal",
        title: "Additional monitored signal 3",
        text: "A distinct monitored signal also appeared in this window.",
        citationIds: [],
        storyClusterId: "secondary-3",
      },
    ]);
  });

  it("never includes secondary material on the single-story route", () => {
    const lead = planItem("lead", ["lead-feed"], ["rss"]);
    const sections = buildDeterministicReaderSummaryNarrative({
      input: {
        coveragePlan: {
          mode: "single_story",
          lead,
          secondary: [planItem("unrelated", ["other"], ["rss"])],
        },
      } as unknown as ReaderSummaryModelInput,
      executiveSummary: "One synthetic lead.",
      citationMap: [citation("lead-citation", "lead-feed", "rss")],
      topStories: [],
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      kind: "lead",
      storyClusterId: "lead",
      citationIds: ["lead-citation"],
    });
  });

});

const planItem = (
  clusterId: string,
  feedItemIds: readonly string[],
  providerKeys: readonly string[],
): ReaderSummaryCoveragePlanItem => ({
  role: clusterId === "lead" ? "lead" : "secondary",
  clusterId,
  score: 2,
  feedItemIds,
  providerKeys,
  interestIds: ["ai"],
  whyImportant: ["Relevant monitored signal"],
});

const citation = (
  citationId: string,
  feedItemId: string,
  providerKey: string,
): DraftCitation => ({
  citationId,
  feedItemId,
  sourceItemId: `source-${feedItemId}`,
  providerKey,
  field: "title",
  canonicalUrl: `https://example.test/${feedItemId}`,
});
