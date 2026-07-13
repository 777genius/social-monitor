import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { buildReaderSummary } from "./reader-summary";

describe("ReaderSummary narrative lead projection", () => {
  it("aligns the headline and first top read with the structured lead", () => {
    const fixture = summaryFixture(2);
    const summary = buildReaderSummary({
      ...fixture,
      headline: "Reports say an unrelated legal story dominated the day",
      narrativeSections: [leadSection(2)],
    });

    expect(summary.topReads[0]?.title).toBe(storyTitle(2));
    expect(summary.headline).toBe(`Hacker News discussion: ${storyTitle(2)}`);
    expect(summary.headline).not.toContain("legal");
  });

  it("keeps an eligible lead when it falls outside the ranked limit", () => {
    const summary = buildReaderSummary({
      ...summaryFixture(12),
      narrativeSections: [leadSection(12)],
    });

    expect(summary.topReads).toHaveLength(8);
    expect(summary.topReads[0]?.title).toBe(storyTitle(12));
    expect(summary.headline).toBe(`Hacker News discussion: ${storyTitle(12)}`);
  });

  it("refills eight unique reader-facing top reads after authored candidates are filtered", () => {
    const fixture = summaryFixture(33);
    const fallbackTitle = "Independent benchmark compares agent cache overhead";
    const summary = buildReaderSummary({
      ...fixture,
      narrativeSections: [leadSection(1)],
      topStories: fixture.topStories.slice(0, 32).map((story, index) =>
        index < 7
          ? story
          : {
              ...story,
              title: "Current AI product discussion",
              summary: "Source-reported: current signal",
            },
      ),
      selectedEvidence: fixture.selectedEvidence.map((evidence, index) =>
        index === 32
          ? {
              ...evidence,
              title: fallbackTitle,
              whyImportant: [
                "The benchmark provides a concrete cache-efficiency comparison.",
              ],
            }
          : index >= 7
            ? {
                ...evidence,
                title: "Current AI product discussion",
                whyImportant: ["Source-reported: current signal"],
              }
            : evidence,
      ),
    });

    expect(summary.topReads).toHaveLength(8);
    expect(summary.topReads[0]?.title).toBe(storyTitle(1));
    expect(
      summary.topReads.filter((item) =>
        item.citationIds.includes("citation-33"),
      ),
    ).toHaveLength(1);
    const citationIds = summary.topReads.flatMap((item) => item.citationIds);
    const canonicalUrls = summary.topReads.flatMap((item) =>
      item.canonicalUrl === undefined ? [] : [item.canonicalUrl],
    );
    const providerCounts = summary.topReads.reduce<Record<string, number>>(
      (counts, item) => ({
        ...counts,
        [item.providerKey]: (counts[item.providerKey] ?? 0) + 1,
      }),
      {},
    );

    expect(new Set(citationIds).size).toBe(citationIds.length);
    expect(new Set(canonicalUrls).size).toBe(canonicalUrls.length);
    expect(Math.max(...Object.values(providerCounts))).toBeLessThanOrEqual(4);
  });

  it("fails closed when the narrative lead evidence is top-read ineligible", () => {
    const fixture = summaryFixture(3);
    const summary = buildReaderSummary({
      ...fixture,
      headline: "Reports say an unrelated legal story dominated the day",
      narrativeSections: [leadSection(3)],
      selectedEvidence: fixture.selectedEvidence.map((evidence) =>
        evidence.feedItemId === "feed-3"
          ? {
              ...evidence,
              contentQuality: {
                qualityScore: 0.2,
                interestRelevanceScore: 0.2,
                engagementIntegrityScore: 0.2,
                eligibleForSummary: true,
                eligibleForTopRead: false,
                needsLlmReview: false,
                decision: "downrank",
                flags: ["weak_topic_match"],
                reason: "Evidence is not eligible for a top read.",
              },
            }
          : evidence,
      ),
    });

    expect(summary).toMatchObject({
      headline: "No reliable workspace signal yet",
      topReads: [],
      narrativeSections: [],
      oneLineTakeaway:
        "The planned narrative lead did not pass the top-read evidence gate.",
      qualityState: { status: "no_signal" },
    });
  });

  it("fails closed when the narrative lead is not reader-facing", () => {
    const fixture = summaryFixture(3);
    const summary = buildReaderSummary({
      ...fixture,
      headline: "Reports say an unrelated legal story dominated the day",
      narrativeSections: [leadSection(3)],
      topStories: fixture.topStories.map((story) =>
        story.storyClusterId === "cluster-3"
          ? {
              ...story,
              title: "Current AI product discussion",
              summary: "Source-reported: current signal",
            }
          : story,
      ),
      selectedEvidence: fixture.selectedEvidence.map((evidence) =>
        evidence.feedItemId === "feed-3"
          ? {
              ...evidence,
              title: "Current AI product discussion",
              whyImportant: ["Source-reported: current signal"],
            }
          : evidence,
      ),
    });

    expect(summary).toMatchObject({
      headline: "No reliable workspace signal yet",
      topReads: [],
      narrativeSections: [],
      oneLineTakeaway:
        "The planned narrative lead did not pass the reader-facing quality gate.",
      qualityState: { status: "no_signal" },
    });
    expect(summary.headline).not.toContain("Current AI product discussion");
  });
});

const leadSection = (index: number) => ({
  id: "narrative-1",
  kind: "lead" as const,
  title: `Repository ${index} is the planned lead`,
  text: `Repository ${index} provides the primary signal for the article.`,
  citationIds: [`citation-${index}`],
  storyClusterId: `cluster-${index}`,
});

const summaryFixture = (count: number) => {
  const indexes = Array.from({ length: count }, (_, index) => index + 1);

  return {
    headline: "Repo radar daily summary",
    executiveSummary: "Repo Radar selected today's strongest repositories.",
    topStories: indexes.map(
      (index) =>
        ({
          storyClusterId: `cluster-${index}`,
          title: storyTitle(index),
          summary: `Repository ${index} is gaining attention.`,
          interestIds: ["ai-developer-tools"],
          providerKeys: [providerKey(index)],
          citationIds: [`citation-${index}`],
        }) satisfies TopReadCandidate,
    ),
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: indexes.map(
      (index) =>
        ({
          citationId: `citation-${index}`,
          feedItemId: `feed-${index}`,
          sourceItemId: `source-${index}`,
          providerKey: providerKey(index),
          field: "title",
          canonicalUrl: `https://example.test/story-${index}`,
        }) satisfies ReaderSummaryCitation,
    ),
    storyClusters: indexes.map(
      (index) =>
        ({
          id: `cluster-${index}`,
          storyKey: `${providerKey(index)}:story-${index}`,
          representativeFeedItemId: `feed-${index}`,
          duplicateFeedItemIds: [],
          interestIds: ["ai-developer-tools"],
          providerKeys: [providerKey(index)],
          score: 2.5 - index / 100,
          observedAtRange: {
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T09:00:00.000Z"),
          },
          whyImportant: [`Repository ${index} is gaining attention.`],
        }) satisfies StoryCluster,
    ),
    selectedEvidence: indexes.map(
      (index) =>
        ({
          feedItemId: `feed-${index}`,
          sourceItemId: `source-${index}`,
          sourceBindingId: `binding-${providerKey(index)}`,
          interestId: "ai-developer-tools",
          providerKey: providerKey(index),
          providerName: providerName(index),
          canonicalUrl: `https://example.test/story-${index}`,
          title: storyTitle(index),
          publishedAt: new Date("2026-06-23T08:00:00.000Z"),
          observedAt: new Date("2026-06-23T09:00:00.000Z"),
          score: 2.5 - index / 100,
          readerActionKind: "read_source",
          whyImportant: [`Repository ${index} is gaining attention.`],
        }) satisfies SummaryEvidenceItem,
    ),
    qualityFlags: [],
  };
};

const storyTitles = [
  "Vector search engine cuts index memory",
  "Local coding agent gains sandbox controls",
  "Rust inference runtime adds GPU batching",
  "Database proxy improves failover safety",
  "Browser automation tool exposes trace replay",
  "Package registry signs release provenance",
  "Terminal workspace restores interrupted sessions",
  "Model router measures cache efficiency",
  "Static analyzer detects unsafe prompt assembly",
  "Workflow scheduler isolates concurrent jobs",
  "Code review service groups related findings",
  "Agent harness compares token overhead",
] as const;

const storyTitle = (index: number): string =>
  storyTitles[index - 1] ?? `Developer tooling update ${index}`;

const providerKey = (index: number): string =>
  index === 2 || index === 12
    ? "hacker-news"
    : (["x-twitter", "reddit", "rss"] as const)[index % 3]!;

const providerName = (index: number): string =>
  (
    ({
      "hacker-news": "Hacker News",
      "x-twitter": "X (Twitter)",
      reddit: "Reddit",
      rss: "RSS",
    }) satisfies Record<string, string>
  )[providerKey(index)] ?? providerKey(index);
