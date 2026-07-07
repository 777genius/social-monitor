import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopRead } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { buildReaderSummaryClaimBoard } from "./reader-summary-claim-board";

describe("buildReaderSummaryClaimBoard", () => {
  it("uses frozen evidence titles for cited evidence lines", () => {
    const claims = buildReaderSummaryClaimBoard({
      topReads: [
        topRead({
          title: "EU Chat Control coverage becomes the policy story",
          citationIds: ["c1", "c2"],
          confirmedProviderKeys: ["rss", "hacker-news"],
        }),
      ],
      risksAndUnknowns: [],
      citationMap: [
        citation({
          citationId: "c1",
          feedItemId: "feed-rss",
          providerKey: "rss",
        }),
        citation({
          citationId: "c2",
          feedItemId: "feed-hn",
          providerKey: "hacker-news",
        }),
      ],
      selectedEvidence: [
        evidence({
          feedItemId: "feed-rss",
          providerKey: "rss",
          title: "European Parliament committee advances Chat Control talks",
        }),
        evidence({
          feedItemId: "feed-hn",
          providerKey: "hacker-news",
          title: "HN discussion questions EU client-side scanning proposal",
        }),
      ],
    });

    expect(claims[0]?.evidence).toEqual([
      {
        title: "European Parliament committee advances Chat Control talks",
        providerKey: "rss",
        citationId: "c1",
        canonicalUrl: "https://example.com/c1",
      },
      {
        title: "HN discussion questions EU client-side scanning proposal",
        providerKey: "hacker-news",
        citationId: "c2",
        canonicalUrl: "https://example.com/c2",
      },
    ]);
  });

  it("keeps fallback evidence and deterministic trust risks", () => {
    const claims = buildReaderSummaryClaimBoard({
      topReads: [
        topRead({
          title: "Single source report needs confirmation",
          citationIds: ["c1"],
          confidence: {
            level: "low",
            score: 0.42,
            rationale:
              "This story has not been independently confirmed across monitored source groups yet.",
          },
          confirmedProviderKeys: ["reddit"],
        }),
      ],
      risksAndUnknowns: [],
      citationMap: [
        citation({
          citationId: "c1",
          feedItemId: "feed-1",
          providerKey: "reddit",
        }),
      ],
    });

    expect(claims[0]).toMatchObject({
      claim: "Single source report needs confirmation",
      evidence: [
        {
          title: "Single source report needs confirmation",
          providerKey: "reddit",
          citationId: "c1",
        },
      ],
      risks: [
        {
          kind: "single_source",
          description:
            "Needs independent confirmation before treating it as verified.",
        },
        {
          kind: "low_confidence",
          description:
            "This story has not been independently confirmed across monitored source groups yet.",
        },
      ],
    });
  });
});

const topRead = (overrides: Partial<TopRead> = {}): TopRead => ({
  title: "Reader story",
  providerKey: "reddit",
  providerName: "Reddit",
  primaryActionKind: "read_source",
  reason: "Useful source context.",
  matchedInterestIds: ["ai-policy"],
  matchedRules: ["interest:ai-policy"],
  signalScore: 8,
  confidence: {
    level: "medium",
    score: 0.64,
    rationale: "2 monitored source groups support this story.",
  },
  confirmedProviderKeys: ["reddit", "rss"],
  providerMetrics: [],
  whyImportant: ["It affects monitored AI policy work."],
  whyNow: "Current summary window has cross-source coverage.",
  canonicalUrl: "https://example.com/read",
  citationIds: ["c1"],
  ...overrides,
});

const citation = (
  overrides: Partial<ReaderSummaryCitation> = {},
): ReaderSummaryCitation => ({
  citationId: "c1",
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  providerKey: "reddit",
  field: "title",
  canonicalUrl: `https://example.com/${overrides.citationId ?? "c1"}`,
  ...overrides,
});

const evidence = (
  overrides: Partial<SummaryEvidenceItem> = {},
): SummaryEvidenceItem => ({
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  sourceBindingId: "binding-1",
  interestId: "ai-policy",
  providerKey: "reddit",
  providerName: "Reddit",
  canonicalUrl: "https://example.com/source",
  title: "Source title",
  publishedAt: new Date("2026-07-04T10:00:00.000Z"),
  observedAt: new Date("2026-07-04T11:00:00.000Z"),
  score: 4,
  whyImportant: ["Relevant source evidence."],
  ...overrides,
});
