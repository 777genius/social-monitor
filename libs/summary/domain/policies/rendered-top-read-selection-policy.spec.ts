import type { SourceMixEntry } from "../entities/source-mix-entry";
import type { TopRead, TopReadCandidate } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  isReaderFacingQualityTopRead,
  selectRenderedTopReadCandidates,
  type RenderedTopReadCandidate,
} from "./rendered-top-read-selection-policy";
import { readerSummaryEditorialCurationRule } from "./reader-summary-editorial-curation-policy";

describe("selectRenderedTopReadCandidates", () => {
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

  it("admits detailed curated discussions without admitting raw or X fallbacks", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate("curated-reddit-comparison", "reddit", 1.69, {
          editoriallyCurated: true,
          reason: detailedReason("Curated Reddit comparison"),
        }),
        candidate("uncurated-hn-comparison", "hacker-news", 1.75, {
          reason: detailedReason("Uncurated HN comparison"),
        }),
        candidate("curated-x-claim", "x-twitter", 1.8, {
          editoriallyCurated: true,
          reason: detailedReason("Curated X claim"),
        }),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 8,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "curated-reddit-comparison",
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

  it.each([
    "There is no supporting evidence for the claimed subscription deadline.",
    "The claim remains rumor-like and should not guide subscription decisions.",
    "Treat the claim as unverified unless corroborated by another source.",
    "The claimed deadline needs stronger confirmation before publication.",
    "The claim is based on one post and cannot be verified independently.",
    "The claim is not independently confirmed.",
    "The post does not provide supporting evidence.",
  ])(
    "rejects an explicitly unsupported single-source X claim: %s",
    (reason) => {
      const result = selectRenderedTopReadCandidates({
        candidates: [
          candidate(
            "Half of Claude Code subscriptions could be disabled tonight",
            "x-twitter",
            3.2,
            { reason },
          ),
        ],
        sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
        limit: 10,
      });

      expect(result).toEqual([]);
    },
  );

  it("does not reject a source-backed post that contrasts itself with rumor", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate("A reproducible coding-agent benchmark", "x-twitter", 2.35, {
          reason:
            "The post provides reproducible logs rather than rumor-like speculation.",
        }),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "A reproducible coding-agent benchmark",
    ]);
  });

  it("keeps a substantive single-source X report without unsupported markers", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate(
          "Developers route GPT-5.6 through Claude Code",
          "x-twitter",
          2.35,
          {
            reason:
              "The post documents a concrete proxy configuration and clearly identifies it as a practitioner workflow.",
          },
        ),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 10,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "Developers route GPT-5.6 through Claude Code",
    ]);
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

  it("rejects source-framed restatements without dropping concise evidence", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate("A viral prediction dominates tonight", "x-twitter", 2.45, {
          reason: "The X post reports: A viral prediction dominates tonight.",
        }),
        candidate("A generic Reddit reaction", "reddit", 2.35, {
          reason: "The Reddit post states: A generic Reddit reaction.",
        }),
        candidate("Production agent migration cuts cost", "hacker-news", 2.1, {
          reason:
            "A production team reports lower cost and faster completion after migration.",
        }),
        candidate("Official model access window changes", "x-twitter", 2.05, {
          canonicalUrl: "https://x.com/OpenAI/status/42",
          reason:
            "The first-party update gives teams a concrete date for changing usage plans.",
        }),
        candidate("Independent release coverage", "rss", 2.0, {
          confirmedProviderKeys: ["rss", "hacker-news"],
          confidenceLevel: "medium",
          reason:
            "Independent coverage adds release details and operational context.",
        }),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 8,
    });

    expect(result.map((item) => item.topRead.title)).toEqual(
      expect.arrayContaining([
        "Production agent migration cuts cost",
        "Official model access window changes",
        "Independent release coverage",
      ]),
    );
    expect(result.map((item) => item.topRead.title)).not.toEqual(
      expect.arrayContaining([
        "A viral prediction dominates tonight",
        "A generic Reddit reaction",
      ]),
    );
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

  it("keeps cross-source semantic duplicates out of the entire top-read list", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate(
          "Developers mix Claude, Codex and OpenCode for GPT 5.6 Sol",
          "x-twitter",
          2.7,
          {
            reason:
              "A Claude Code workflow points at GPT 5.6 Sol through a proxy while comparing Codex and OpenCode.",
          },
        ),
        candidate(
          "AI research careers narrow explored ideas",
          "hacker-news",
          2.6,
        ),
        candidate("Apple files an OpenAI trade-secret lawsuit", "reddit", 2.5),
        candidate("Coding assistant token overhead comparison", "rss", 2.4),
        candidate(
          "Run GPT 5.6 Sol inside Claude Code through CLIProxyAPI",
          "hacker-news",
          2.3,
          {
            reason:
              "The setup routes Claude Code to GPT 5.6 Sol with CLIProxyAPI and a shell alias.",
          },
        ),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 5,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "Developers mix Claude, Codex and OpenCode for GPT 5.6 Sol",
      "AI research careers narrow explored ideas",
      "Apple files an OpenAI trade-secret lawsuit",
      "Coding assistant token overhead comparison",
    ]);
  });

  it("pins the narrative lead without retaining its editorial near-duplicate", () => {
    const pinned = candidate(
      "Run GPT 5.6 Sol inside Claude Code through CLIProxyAPI",
      "hacker-news",
      2.3,
      {
        reason:
          "The setup routes Claude Code to GPT 5.6 Sol with CLIProxyAPI and a shell alias.",
      },
    );
    const duplicate = candidate(
      "Developers mix Claude, Codex and OpenCode for GPT 5.6 Sol",
      "x-twitter",
      2.7,
      {
        reason:
          "A Claude Code workflow points at GPT 5.6 Sol through a proxy while comparing Codex and OpenCode.",
      },
    );
    const result = selectRenderedTopReadCandidates({
      candidates: [
        duplicate,
        candidate(
          "AI research careers narrow explored ideas",
          "hacker-news",
          2.6,
        ),
        pinned,
      ],
      sourceMix: sourceMix(["x-twitter", "hacker-news"]),
      limit: 3,
      pinnedStoryClusterId: pinned.story.storyClusterId,
    });

    expect(result[0]?.story.storyClusterId).toBe(pinned.story.storyClusterId);
    expect(result.map((item) => item.story.storyClusterId)).not.toContain(
      duplicate.story.storyClusterId,
    );
  });

  it("does not select a concise pinned candidate twice", () => {
    const pinned = candidate("Token overhead", "hacker-news", 2.3, {
      reason: "Short reason",
      evidence: [],
    });
    const result = selectRenderedTopReadCandidates({
      candidates: [pinned],
      sourceMix: sourceMix(["hacker-news"]),
      limit: 2,
      pinnedStoryClusterId: pinned.story.storyClusterId,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.story.storyClusterId).toBe(pinned.story.storyClusterId);
  });

  it("keeps different Claude Code events in the editorial window", () => {
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate(
          "Claude Code weekly usage limits reset for subscribers",
          "reddit",
          2.35,
        ),
        candidate(
          "Claude Code releases a desktop extension",
          "hacker-news",
          2.3,
        ),
        candidate("Apple files an OpenAI trade-secret lawsuit", "rss", 2.2),
        candidate("AI research careers narrow explored ideas", "reddit", 2.1),
      ],
      sourceMix: sourceMix(["reddit", "hacker-news", "rss"]),
      limit: 4,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "Claude Code weekly usage limits reset for subscribers",
      "Claude Code releases a desktop extension",
      "Apple files an OpenAI trade-secret lawsuit",
      "AI research careers narrow explored ideas",
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

  it("keeps the authoritative coverage lead first despite viral engagement", () => {
    const authoritative = candidate("official-supported-update", "rss", 2.1, {
      confirmedProviderKeys: ["rss", "hacker-news"],
      confidenceLevel: "high",
    });
    const viralSingleSource = candidate(
      "viral-single-source",
      "x-twitter",
      3.2,
    );

    const result = selectRenderedTopReadCandidates({
      candidates: [
        {
          ...viralSingleSource,
          editorialPriority: editorialPriority(3.2, true),
        },
        {
          ...authoritative,
          editorialPriority: editorialPriority(2.8, true, true),
        },
      ],
      sourceMix: sourceMix(["x-twitter", "rss", "hacker-news"]),
      limit: 8,
    });

    expect(result.map((item) => item.topRead.title)).toEqual([
      "official-supported-update",
      "viral-single-source",
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

  it("keeps a concise high-signal read when eight verbose reads exist", () => {
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
      limit: 8,
    });

    expect(result).toHaveLength(8);
    expect(result.map((item) => item.topRead.title)).toContain(
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

  it("does not repeat an identical detailed reason outside the diversity window", () => {
    const repeatedReason =
      "The temporary access extension changes how teams schedule long coding-agent work and creates lock-in risk when projects depend on a short-lived quota shape.";
    const result = selectRenderedTopReadCandidates({
      candidates: [
        candidate("Apple legal risk", "reddit", 2.7, {
          reason: detailedReason("Apple legal risk"),
        }),
        candidate("Token overhead", "hacker-news", 2.6, {
          reason: detailedReason("Token overhead"),
        }),
        candidate("Obsidian skills", "x-twitter", 2.5, {
          reason: detailedReason("Obsidian skills"),
        }),
        candidate("Research careers", "hacker-news", 2.4, {
          reason: detailedReason("Research careers"),
        }),
        candidate("Claude limit promotion", "x-twitter", 2.3, {
          reason: repeatedReason,
        }),
        candidate("Claude weekly limits", "hacker-news", 2.2, {
          reason: repeatedReason,
        }),
      ],
      sourceMix: sourceMix(["x-twitter", "reddit", "hacker-news", "rss"]),
      limit: 8,
    });

    expect(
      result
        .map((item) => item.topRead.title)
        .filter((title) => title.startsWith("Claude")),
    ).toEqual(["Claude limit promotion"]);
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
  } = {},
): RenderedTopReadCandidate => {
  const reason = overrides.reason ?? `${title} reason`;

  return {
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
  authoritativeLead = false,
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
  firstPartyOfficial: false,
  authoritativeLead,
  leadEligible,
});

const detailedReason = (label: string): string =>
  `${label} explains what happened in the monitored product update and why it matters for real user workflows. It adds concrete operational context about likely impact, adoption constraints and the decisions teams may need to revisit. The remaining uncertainty is stated clearly so readers can separate grounded evidence from early interpretation.`;
