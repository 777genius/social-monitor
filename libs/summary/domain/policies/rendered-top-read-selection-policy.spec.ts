import type { TopRead, TopReadCandidate } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  isReaderFacingQualityTopRead,
  type RenderedTopReadCandidate,
} from "./rendered-top-read-selection-policy";
import { readerSummaryEditorialCurationRule } from "./reader-summary-editorial-curation-policy";

// The rendered Top selector is gone; the reader-facing quality gate stays
// because weekly story identity still uses it.
describe("isReaderFacingQualityTopRead", () => {
  it("rejects an unrepaired agreement error through the rendered quality gate", () => {
    expect(
      isReaderFacingQualityTopRead(
        candidate(
          "AI boosts research careers but narrow the span of ideas explored: study",
          "hacker-news",
          2.13,
        ).topRead,
      ),
    ).toBe(false);
    expect(
      isReaderFacingQualityTopRead(
        candidate(
          "AI boosts research careers but narrows the span of ideas explored: study",
          "hacker-news",
          2.13,
        ).topRead,
      ),
    ).toBe(true);
  });

  it("rejects copied clickbait titles with broken double-dot punctuation", () => {
    expect(
      isReaderFacingQualityTopRead(
        candidate(
          "Bye Claude..it was nice while it lasted, until it wasn't.",
          "reddit",
          2.12,
          {
            reason:
              "The post describes frustration with changing Claude usage limits but does not provide a concrete product update.",
          },
        ).topRead,
      ),
    ).toBe(false);
  });

  it.each([
    ["x-raw-fallback", "x-twitter", 2.3, "Source-reported: raw X post text"],
    ["reddit-generic-fallback", "reddit", 2.31,
      "Reddit discussion is a current signal for monitored AI developer topics; its claims remain source-reported until independently confirmed."],
    ["OpenAI starts rolling out GPT-5.6", "x-twitter", 2.5, "OpenAI starts rolling out GPT-5.6."],
    ["Unverified report: Government approves a new AI model rollout", "x-twitter", 2.35,
      "The post is an unverified rollout report and should not be treated as confirmation."],
    ["Half of Claude Code subscriptions could be disabled tonight", "x-twitter", 3.2,
      "The claim is not independently confirmed."],
  ] as const)("rejects %s", (title, providerKey, signalScore, reason) => {
    expect(isReaderFacingQualityTopRead(
      candidate(title, providerKey, signalScore, { reason }).topRead)).toBe(false);
  });

  it("keeps substantive single-source reads and detailed curated discussions", () => {
    expect(isReaderFacingQualityTopRead(candidate(
      "A reproducible coding-agent benchmark", "x-twitter", 2.35, {
        reason: "The post provides reproducible logs rather than rumor-like speculation.",
      }).topRead)).toBe(true);
    expect(isReaderFacingQualityTopRead(candidate(
      "curated-reddit-comparison", "reddit", 1.69, {
        editoriallyCurated: true,
        reason: detailedReason("Curated Reddit comparison"),
      }).topRead)).toBe(true);
    expect(isReaderFacingQualityTopRead(candidate(
      "curated-x-claim", "x-twitter", 1.8, {
        editoriallyCurated: true,
        reason: detailedReason("Curated X claim"),
      }).topRead)).toBe(false);
  });
});

const candidate = (
  title: string,
  providerKey: string,
  signalScore: number,
  overrides: {
    readonly confirmedProviderKeys?: readonly string[];
    readonly confidenceLevel?: TopRead["confidence"]["level"];
    readonly canonicalUrl?: string;
    readonly reason?: string;
    readonly evidence?: readonly SummaryEvidenceItem[];
    readonly editoriallyCurated?: boolean;
    readonly storyClusterId?: string;
  } = {},
): RenderedTopReadCandidate => {
  const reason = overrides.reason ?? `${title} reason`;

  return {
    story: {
      storyClusterId: overrides.storyClusterId ?? `story:${title}`,
      title,
      summary: `${title} summary`,
      interestIds: ["ai-agents"],
      providerKeys: [providerKey],
      citationIds: [`citation:${title}`],
    } satisfies TopReadCandidate,
    topRead: {
      title,
      providerKey,
      providerName: providerKey,
      primaryActionKind: "read_source",
      reason,
      matchedInterestIds: ["ai-agents"],
      matchedRules: [
        "interest:ai-agents",
        ...(overrides.editoriallyCurated === true
          ? [readerSummaryEditorialCurationRule]
          : []),
      ],
      signalScore,
      confidence: {
        level: overrides.confidenceLevel ?? "low",
        score: 0.42,
        rationale: "test",
      },
      confirmedProviderKeys: overrides.confirmedProviderKeys ?? [providerKey],
      providerMetrics: [],
      whyImportant: [`${title} matters`],
      whyNow: "test",
      canonicalUrl: overrides.canonicalUrl,
      citationIds: [`citation:${title}`],
    },
    evidence: overrides.evidence ?? [evidenceItem(title, providerKey, reason)],
  };
};

const evidenceItem = (
  title: string,
  providerKey: string,
  bodyPreview: string,
): SummaryEvidenceItem => ({
  feedItemId: `feed:${providerKey}:${title}`,
  sourceItemId: `source:${providerKey}:${title}`,
  sourceBindingId: `binding:${providerKey}`,
  interestId: "ai-agents",
  providerKey,
  canonicalUrl: `https://example.test/${encodeURIComponent(title)}`,
  title,
  bodyPreview,
  publishedAt: new Date("2026-07-12T12:00:00.000Z"),
  observedAt: new Date("2026-07-12T12:01:00.000Z"),
  score: 1,
  whyImportant: [`${title} matters`],
});

const detailedReason = (label: string): string =>
  `${label} explains what happened in the monitored product update and why it matters for real user workflows. It adds concrete operational context about likely impact, adoption constraints and the decisions teams may need to revisit. The remaining uncertainty is stated clearly so readers can separate grounded evidence from early interpretation.`;
