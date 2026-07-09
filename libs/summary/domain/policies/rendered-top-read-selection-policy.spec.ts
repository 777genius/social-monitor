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
    expect(result.map((item) => item.topRead.title)).not.toContain(
      "x-5",
    );
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

  it("does not treat official X fallback text as quality by default", () => {
    const candidates = [
      ...Array.from({ length: 4 }, (_, index) =>
        candidate(`x-official-good-${index + 1}`, "x-twitter", 2.24, {
          canonicalUrl: `https://x.com/OpenAI/status/${index + 1}`,
        }),
      ),
      candidate("x-official-fallback", "x-twitter", 2.1, {
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

const sourceMix = (providerKeys: readonly string[]): readonly SourceMixEntry[] =>
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
