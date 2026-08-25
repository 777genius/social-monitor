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
      } as ReaderSummaryModelInput,
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
