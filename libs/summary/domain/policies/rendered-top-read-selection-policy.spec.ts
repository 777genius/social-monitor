import type { SourceMixEntry } from "../entities/source-mix-entry";
import type { TopRead, TopReadCandidate } from "../entities/top-read";
import {
  selectRenderedTopReadCandidates,
  type RenderedTopReadCandidate,
} from "./rendered-top-read-selection-policy";

describe("selectRenderedTopReadCandidates", () => {
  it("caps the final rendered provider after story candidates are converted", () => {
    const candidates = [
      ...Array.from({ length: 6 }, (_, index) =>
        candidate(`x-${index + 1}`, "x-twitter", 2.4 - index * 0.01),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        candidate(`hn-${index + 1}`, "hacker-news", 2.25 - index * 0.01),
      ),
      candidate("reddit-good", "reddit", 2.01),
      candidate("reddit-weak", "reddit", 1.65),
      candidate("rss-strong", "rss", 2.2, {
        confirmedProviderKeys: ["rss", "hacker-news"],
        confidenceLevel: "medium",
      }),
      candidate("rss-followup", "rss", 2.05),
    ];

    const result = selectRenderedTopReadCandidates({
      candidates,
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result).toHaveLength(10);
    expect(providerCounts(result)["x-twitter"]).toBeLessThanOrEqual(4);
    expect(result.map((item) => item.topRead.title)).toContain("rss-strong");
    expect(result.map((item) => item.topRead.title)).not.toContain(
      "reddit-weak",
    );
    expect(result.map((item) => item.topRead.title)).not.toContain("x-5");
  });

  it("refills with quality dominant-provider reads when no alternative source exists", () => {
    const candidates = Array.from({ length: 8 }, (_, index) =>
      candidate(`x-${index + 1}`, "x-twitter", 2.4 - index * 0.01),
    );

    const result = selectRenderedTopReadCandidates({
      candidates,
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "x-1",
      "x-2",
      "x-3",
      "x-4",
      "x-5",
      "x-6",
      "x-7",
      "x-8",
    ]);
  });

  it("does not refill provider caps with weak fallback reads", () => {
    const candidates = [
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`x-good-${index + 1}`, "x-twitter", 2.4 - index * 0.01),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`x-weak-${index + 1}`, "x-twitter", 1.6 - index * 0.01, {
          reason: "Source-reported: weak post",
        }),
      ),
    ];

    const result = selectRenderedTopReadCandidates({
      candidates,
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "x-good-1",
      "x-good-2",
      "x-good-3",
      "x-good-4",
    ]);
  });

  it("rejects strong single-source reads that still have only fallback context", () => {
    const candidates = [
      candidate("x-raw-fallback", "x-twitter", 2.3, {
        reason: "Source-reported: raw X post text",
      }),
      candidate("reddit-generic-fallback", "reddit", 2.31, {
        reason:
          "Reddit discussion is a current signal for monitored AI developer topics; its claims remain source-reported until independently confirmed.",
      }),
    ];

    const result = selectRenderedTopReadCandidates({
      candidates,
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result).toEqual([]);
  });

  it("rejects cross-source reads that still have only fallback context", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate("rss-cross-source-fallback", "rss", 2.5, {
          confirmedProviderKeys: ["rss", "hacker-news"],
          confidenceLevel: "medium",
          reason:
            "The report adds timely context for evaluating monitored AI products and developer workflows.",
        }),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result).toEqual([]);
  });

  it("keeps provider caps during fallback refill when alternatives exist", () => {
    const candidates = [
      ...Array.from({ length: 5 }, (_, index) =>
        candidate(`x-good-${index + 1}`, "x-twitter", 2.5 - index * 0.01),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`reddit-good-${index + 1}`, "reddit", 2.3 - index * 0.01),
      ),
      candidate("hn-good", "hacker-news", 2.1),
    ];

    const result = selectRenderedTopReadCandidates({
      candidates,
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(providerCounts(result)["x-twitter"]).toBeLessThanOrEqual(4);
    expect(result.map((item) => item.topRead.title)).not.toContain("x-good-5");
  });

  it("does not treat official X fallback text as quality by default", () => {
    const candidates = [
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`x-official-good-${index + 1}`, "x-twitter", 2.24, {
          canonicalUrl: `https://x.com/OpenAI/status/${index + 1}`,
        }),
      ),
      candidate("x-official-fallback", "x-twitter", 2.4, {
        canonicalUrl: "https://x.com/OpenAI/status/99",
        reason: "Source-reported: raw X post text",
      }),
    ];

    const result = selectRenderedTopReadCandidates({
      candidates,
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "x-official-good-1",
      "x-official-good-2",
      "x-official-good-3",
      "x-official-good-4",
    ]);
  });

  it("rejects normalized unverified X reports without cross-source support", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate(
          "Unverified report: Government approves a new AI model rollout",
          "x-twitter",
          2.35,
          {
            reason:
              "The post is an unverified rollout report and should not be treated as confirmation.",
          },
        ),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result).toEqual([]);
  });

  it("rejects candidates whose reason only repeats the title", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate("OpenAI starts rolling out GPT-5.6", "x-twitter", 2.5, {
          reason: "OpenAI starts rolling out GPT-5.6.",
        }),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result).toEqual([]);
  });

  it("orders selected reads by support quality before model order", () => {
    const candidates = [
      candidate("x-single-source", "x-twitter", 2.3),
      candidate("reddit-cross-source", "reddit", 2.32, {
        confirmedProviderKeys: ["reddit", "rss"],
        confidenceLevel: "high",
      }),
    ];

    const result = selectRenderedTopReadCandidates({
      candidates,
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "reddit-cross-source",
      "x-single-source",
    ]);
  });

  it("does not let editorial priority invert a materially stronger read", () => {
    const weakEditorialLead = candidate("weak-editorial-lead", "reddit", 2.05);
    const strongSupportedRead = candidate(
      "strong-supported",
      "hacker-news",
      2.3,
      {
        confirmedProviderKeys: ["hacker-news", "rss"],
        confidenceLevel: "high",
      },
    );

    const result = selectRenderedTopReadCandidates({
      candidates: [
        {
          ...weakEditorialLead,
          editorialPriority: editorialPriority(4.5, true),
        },
        {
          ...strongSupportedRead,
          editorialPriority: editorialPriority(3.5, false),
        },
      ],
      sourceMix: sourceMix(["reddit", "hacker-news", "rss"]),
      limit: 8,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "strong-supported",
      "weak-editorial-lead",
    ]);
  });

  it("orders a stronger supported read above a weak diversity refill", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate("hn-weak", "hacker-news", 1.99),
        candidate("x-supported", "x-twitter", 2.26, {
          confidenceLevel: "medium",
        }),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 8,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "x-supported",
      "hn-weak",
    ]);
  });

  it("drops short supplemental reasons when eight detailed reads exist", () => {
    const detailedCandidates = [
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`x-detailed-${index + 1}`, "x-twitter", 2.4, {
          reason: detailedReason(`X detailed ${index + 1}`),
        }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`reddit-detailed-${index + 1}`, "reddit", 2.3, {
          reason: detailedReason(`Reddit detailed ${index + 1}`),
        }),
      ),
    ];

    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate("short-supplement", "hacker-news", 2.6, {
          reason: "A short source excerpt that lacks a full description.",
        }),
        ...detailedCandidates,
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result).toHaveLength(8);
    expect(result.map((item) => item.topRead.title)).not.toContain(
      "short-supplement",
    );
  });

  it("refills to eight without exceeding four reads from one provider", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        ...Array.from({ length: 4 }, (_, index) =>
          candidate(`x-${index + 1}`, "x-twitter", 2.5 - index * 0.01),
        ),
        ...Array.from({ length: 3 }, (_, index) =>
          candidate(`reddit-${index + 1}`, "reddit", 2.3 - index * 0.01),
        ),
        candidate("hn-1", "hacker-news", 2.1),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 8,
    });

    expect(result).toHaveLength(8);
    expect(providerCounts(result)["x-twitter"]).toBe(4);
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
  } = {},
): RenderedTopReadCandidate => ({
  story: {
    storyClusterId: `story:${title}`,
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
    reason: overrides.reason ?? `${title} reason`,
    matchedInterestIds: ["ai-agents"],
    matchedRules: ["interest:ai-agents"],
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
});

const sourceMix = (
  providerKeys: readonly string[],
): readonly SourceMixEntry[] =>
  providerKeys.map((providerKey) => ({
    providerKey,
    itemCount: 1,
    citationCount: 1,
    storyClusterCount: 1,
    crossSourceClusterCount: 0,
    singleSourceOnly: true,
    interestIds: ["ai-agents"],
  }));

const providerCounts = (
  candidates: readonly RenderedTopReadCandidate[],
): Record<string, number> =>
  candidates.reduce<Record<string, number>>((counts, candidate) => {
    const providerKey = candidate.topRead.providerKey;
    counts[providerKey] = (counts[providerKey] ?? 0) + 1;

    return counts;
  }, {});

const editorialPriority = (
  editorialScore: number,
  leadEligible: boolean,
): NonNullable<RenderedTopReadCandidate["editorialPriority"]> => ({
  providerKey: "test",
  editorialScore,
  signalScore: editorialScore,
  baseSignalScore: editorialScore,
  metricStrength: 1,
  qualityScore: 1,
  coreTopicStrength: 1,
  confidenceLevel: "medium",
  citationCount: 1,
  confirmedProviderCount: 1,
  leadEligible,
});

const detailedReason = (label: string): string =>
  `${label} explains what happened in the monitored product update and why it matters for real user workflows. It adds concrete operational context about likely impact, adoption constraints and the decisions teams may need to revisit. The remaining uncertainty is stated clearly so readers can separate grounded evidence from early interpretation.`;
