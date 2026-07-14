import type { TopRead } from "../entities/top-read";
import {
  buildGroundedOneLineTakeaway,
  groundedReaderHeadline,
  readerItemConfidence,
} from "./reader-summary-support";
import type { StoryCluster } from "../value-objects/summary-evidence-item";

describe("readerItemConfidence", () => {
  it("keeps single-source evidence low and capped", () => {
    expect(
      readerItemConfidence({
        cluster: undefined,
        independentEvidenceCount: 1,
        confirmedProviderCount: 1,
        signalScore: 4,
      }),
    ).toEqual({
      level: "low",
      score: 0.42,
      rationale:
        "This story has not been independently confirmed across monitored source groups yet.",
    });
  });

  it("treats multi-source citations without a linked story group as medium support", () => {
    expect(
      readerItemConfidence({
        cluster: undefined,
        independentEvidenceCount: 2,
        confirmedProviderCount: 2,
        signalScore: 1,
      }),
    ).toEqual({
      level: "medium",
      score: 0.67,
      rationale:
        "2 cited source groups support this story, but the key claim has not been fully cross-verified yet.",
    });
  });

  it("treats an eligible first-party announcement as medium without claiming independent confirmation", () => {
    expect(
      readerItemConfidence({
        cluster: undefined,
        independentEvidenceCount: 1,
        confirmedProviderCount: 1,
        signalScore: 2.4,
        firstPartyOfficial: true,
      }),
    ).toEqual({
      level: "medium",
      score: 0.62,
      rationale:
        "This is a first-party official source for the announcement; product performance and comparative claims remain source-reported until independently verified.",
    });
  });

  it("keeps a two-provider community cluster at medium confidence", () => {
    expect(
      readerItemConfidence({
        cluster: crossProviderCluster(),
        independentEvidenceCount: 2,
        confirmedProviderCount: 2,
        signalScore: 4,
      }),
    ).toEqual({
      level: "medium",
      score: 0.68,
      rationale:
        "2 monitored source groups surface this story, but repetition across platforms does not independently verify every claim.",
    });
  });

  it("allows high confidence when cross-source support includes first-party evidence", () => {
    expect(
      readerItemConfidence({
        cluster: crossProviderCluster(),
        independentEvidenceCount: 2,
        confirmedProviderCount: 2,
        signalScore: 4,
        firstPartyOfficial: true,
      }),
    ).toEqual({
      level: "high",
      score: 1,
      rationale:
        "2 monitored source groups support this story, including an eligible first-party source.",
    });
  });
});

describe("buildGroundedOneLineTakeaway", () => {
  it("preserves a structured executive summary when cross-source evidence grounds it", () => {
    const executiveSummary = [
      "**Agent tooling** moved toward longer-running workflows across apps and files.",
      "",
      "A separate policy thread remained less certain and needs confirmation before action.",
    ].join("\n");

    expect(
      buildGroundedOneLineTakeaway({
        executiveSummary,
        topReads: [topRead()],
        sourceMix: [],
      }),
    ).toBe(executiveSummary);
  });

  it("preserves synthesis prose grounded by multiple clusters and provider groups", () => {
    const executiveSummary =
      "AI coding teams are balancing agent isolation, runtime efficiency and infrastructure cost across several distinct developments.";
    const lead = {
      ...topRead(),
      confidence: {
        level: "low" as const,
        score: 0.42,
        rationale: "Single source",
      },
      confirmedProviderKeys: ["x-twitter"],
    };

    expect(
      buildGroundedOneLineTakeaway({
        executiveSummary,
        topReads: [lead],
        sourceMix: [],
        thematicSynthesisSupport: { clusterCount: 2, providerCount: 2 },
      }),
    ).toBe(executiveSummary);
  });

  it("rejects synthesis prose when all cited clusters resolve to one provider group", () => {
    const executiveSummary =
      "AI coding teams are balancing agent isolation, runtime efficiency and infrastructure cost across several distinct developments.";
    const lead = {
      ...topRead(),
      confidence: {
        level: "low" as const,
        score: 0.42,
        rationale: "Single source",
      },
      confirmedProviderKeys: ["x-twitter"],
    };

    const result = buildGroundedOneLineTakeaway({
      executiveSummary,
      topReads: [lead],
      sourceMix: [],
      thematicSynthesisSupport: { clusterCount: 2, providerCount: 1 },
    });

    expect(result).not.toBe(executiveSummary);
    expect(result).toContain("Confirm important claims");
  });
});

describe("groundedReaderHeadline", () => {
  it("removes terminal full stops while preserving article headline text", () => {
    expect(
      groundedReaderHeadline({
        headline:
          "Developers route GPT-5.6 Sol through Claude Code as costs dominate.",
        topReads: [topRead()],
        sourceMix: [],
      }),
    ).toBe(
      "Developers route GPT-5.6 Sol through Claude Code as costs dominate",
    );
  });

  it("replaces a vague daily wrap headline with the concrete lead title", () => {
    const lead = {
      ...topRead(),
      title: "Acme launches a lower-cost coding model",
    };

    expect(
      groundedReaderHeadline({
        headline: "Acme's release tops a day of model-cost and access chatter",
        topReads: [lead],
        sourceMix: [],
      }),
    ).toBe("Acme launches a lower-cost coding model");
  });

  it("does not trust a thematic headline when its citations come from one provider group", () => {
    const lead = {
      ...topRead(),
      confidence: {
        level: "low" as const,
        score: 0.42,
        rationale: "Single source",
      },
      confirmedProviderKeys: ["x-twitter"],
    };

    expect(
      groundedReaderHeadline({
        headline:
          "AI coding teams weigh sandboxing, runtime performance and memory costs",
        topReads: [lead],
        sourceMix: [],
        thematicSynthesisSupport: { clusterCount: 2, providerCount: 1 },
      }),
    ).toBe("Reports discuss Agent tooling expands across apps");
  });

  it("source-frames an unverified legal lead when replacing a vague headline", () => {
    const lead = {
      ...topRead(),
      title: "Acme sues Example Labs over alleged model theft",
      reason:
        "Community reports repeat the alleged dispute, but the filings are not available and the merits remain unknown.",
      confidence: {
        level: "medium" as const,
        score: 0.68,
        rationale:
          "Two monitored source groups surface this story, but repetition does not independently verify the allegation.",
      },
      confirmedProviderKeys: ["reddit", "hacker-news"],
    };

    expect(
      groundedReaderHeadline({
        headline: "Acme's lawsuit tops a day of model-cost and access chatter",
        topReads: [lead],
        sourceMix: [],
      }),
    ).toBe("Reports say Acme sued Example Labs over alleged model theft");
  });

  it("removes a trailing quote-bearing report clause before compacting a legal headline", () => {
    const lead = {
      ...topRead(),
      title:
        "Apple sued OpenAI alleging trade secret theft, says scheme was 'at every level'",
      reason:
        "Community reports repeat the alleged dispute, but the filings are not available and the merits remain unknown.",
      confidence: {
        level: "medium" as const,
        score: 0.68,
        rationale:
          "Two monitored source groups surface this story, but repetition does not independently verify the allegation.",
      },
      confirmedProviderKeys: ["reddit", "hacker-news"],
    };

    const headline = groundedReaderHeadline({
      headline: "Apple lawsuit reports lead a day of AI coding signals",
      topReads: [lead],
      sourceMix: [],
    });

    expect(headline).toBe(
      "Reports say Apple sued OpenAI over alleged trade secret theft",
    );
    expect(headline).not.toMatch(/['‘’“”]/u);
  });

  it("source-frames a direct legal headline when community reports do not include a filing", () => {
    const lead = {
      ...topRead(),
      title: "Acme sues Example Labs over alleged model theft",
      reason:
        "Community reports repeat the alleged dispute, but the filings are not available and the merits remain unknown.",
      confidence: {
        level: "medium" as const,
        score: 0.68,
        rationale:
          "Two monitored source groups surface this story, but repetition does not independently verify the allegation.",
      },
      confirmedProviderKeys: ["reddit", "hacker-news"],
    };

    expect(
      groundedReaderHeadline({
        headline: "Acme sues Example Labs over alleged model theft",
        topReads: [lead],
        sourceMix: [],
      }),
    ).toBe("Reports say Acme sued Example Labs over alleged model theft");

    expect(
      groundedReaderHeadline({
        headline: "Reports say Acme sued Example Labs over alleged model theft",
        topReads: [lead],
        sourceMix: [],
      }),
    ).toBe("Reports say Acme sued Example Labs over alleged model theft");
  });

  it("does not double-prefix an already source-framed legal top-read title", () => {
    const lead = {
      ...topRead(),
      title: "Reports say Apple sued OpenAI over alleged trade secret theft",
      reason: "No primary court filing is available.",
      confidence: {
        level: "medium" as const,
        score: 0.68,
        rationale:
          "Two monitored source groups surface this story, but repetition does not independently verify the allegation.",
      },
      confirmedProviderKeys: ["reddit", "hacker-news"],
    };

    expect(
      groundedReaderHeadline({
        headline: "A vague daily wrap",
        topReads: [lead],
        sourceMix: [],
      }),
    ).toBe("Reports say Apple sued OpenAI over alleged trade secret theft");
  });

  it("collapses an already duplicated legal report prefix", () => {
    const lead = {
      ...topRead(),
      title:
        "Reports say Reports say Apple sued OpenAI over alleged trade secret theft",
      reason: "No primary court filing is available.",
      confidence: {
        level: "medium" as const,
        score: 0.68,
        rationale:
          "Two monitored source groups surface this story, but repetition does not independently verify the allegation.",
      },
      confirmedProviderKeys: ["reddit", "hacker-news"],
    };

    expect(
      groundedReaderHeadline({
        headline: "A vague daily wrap",
        topReads: [lead],
        sourceMix: [],
      }),
    ).toBe("Reports say Apple sued OpenAI over alleged trade secret theft");
  });

  it("keeps a first-party legal action concrete", () => {
    const lead = {
      ...topRead(),
      title: "Acme sues Example Labs over alleged model theft",
      reason:
        "Acme's first-party filing announces the lawsuit; the underlying theft allegation remains unverified.",
      confidence: {
        level: "high" as const,
        score: 0.9,
        rationale:
          "Two monitored source groups support this story, including an eligible first-party source.",
      },
    };

    expect(
      groundedReaderHeadline({
        headline: "Acme's lawsuit tops a day of model-cost and access chatter",
        topReads: [lead],
        sourceMix: [],
      }),
    ).toBe("Acme sues Example Labs over alleged model theft");
  });

  it("does not let unrelated cross-source coverage validate a single-source lead", () => {
    const lead = {
      ...topRead(),
      confidence: {
        level: "low" as const,
        score: 0.42,
        rationale: "Single source",
      },
      confirmedProviderKeys: ["x-twitter"],
      citationIds: ["c1"],
    };

    expect(
      groundedReaderHeadline({
        headline:
          "Developers are routing GPT 5.6 Sol through Claude Code as costs dominate",
        topReads: [lead, topRead()],
        sourceMix: [
          {
            providerKey: "reddit",
            itemCount: 2,
            citationCount: 2,
            storyClusterCount: 1,
            crossSourceClusterCount: 1,
            singleSourceOnly: false,
            interestIds: ["ai-agents"],
          },
        ],
      }),
    ).toBe("Reports discuss Agent tooling expands across apps");
  });

  it("uses one clean lead title instead of joining source-framed reasons", () => {
    const lead = {
      ...topRead(),
      title: "Apple sues OpenAI over alleged trade secret theft",
      providerKey: "reddit",
      providerName: "Reddit",
      reason:
        "The Reddit post reports: Apple sues OpenAI over alleged trade secret theft.",
      confidence: {
        level: "low" as const,
        score: 0.42,
        rationale: "Single source",
      },
      confirmedProviderKeys: ["reddit"],
    };

    expect(
      groundedReaderHeadline({
        headline: "AI product chatter leads the day",
        topReads: [
          lead,
          {
            ...lead,
            title: "Claude Code token overhead draws scrutiny",
          },
          { ...lead, title: "AI changes research career incentives" },
        ],
        sourceMix: [],
      }),
    ).toBe(
      "Reports discuss Apple sues OpenAI over alleged trade secret theft",
    );
  });

  it("preserves an explicitly source-framed single-source headline", () => {
    const lead = {
      ...topRead(),
      confidence: {
        level: "low" as const,
        score: 0.42,
        rationale: "Single source",
      },
      confirmedProviderKeys: ["x-twitter"],
    };

    expect(
      groundedReaderHeadline({
        headline:
          "X/Twitter discussion highlights a Claude Code proxy workflow",
        topReads: [lead],
        sourceMix: [],
      }),
    ).toBe("X/Twitter discussion highlights a Claude Code proxy workflow");
  });

  it("does not treat generic chatter as explicit source framing", () => {
    const lead = {
      ...topRead(),
      confidence: {
        level: "low" as const,
        score: 0.42,
        rationale: "Single source",
      },
      confirmedProviderKeys: ["x-twitter"],
    };

    expect(
      groundedReaderHeadline({
        headline: "Chatter highlights a Claude Code proxy workflow",
        topReads: [lead],
        sourceMix: [],
      }),
    ).toBe("Reports discuss Agent tooling expands across apps");
  });
});

const topRead = (): TopRead => ({
  title: "Agent tooling expands across apps",
  providerKey: "x-twitter",
  providerName: "X/Twitter",
  primaryActionKind: "read_source",
  reason: "Official and community sources describe the rollout.",
  matchedInterestIds: ["ai-agents"],
  matchedRules: [],
  signalScore: 2.5,
  confidence: {
    level: "high",
    score: 0.9,
    rationale: "First-party and independent community support.",
  },
  confirmedProviderKeys: ["x-twitter", "reddit"],
  providerMetrics: [],
  whyImportant: ["The rollout affects long-running agent workflows."],
  whyNow: "The rollout happened in this summary window.",
  citationIds: ["c1", "c2"],
});

const crossProviderCluster = (): StoryCluster => ({
  id: "story:cross-provider",
  storyKey: "title:cross-provider",
  representativeFeedItemId: "feed-1",
  duplicateFeedItemIds: ["feed-2"],
  interestIds: ["ai-agents"],
  providerKeys: ["reddit", "x-twitter"],
  score: 4,
  signalBreakdown: {
    baseScore: 3,
    crossProviderSupport: 0.3,
    sameProviderSupport: 0,
    providerDiversityBoost: 0.25,
    interestDiversityBoost: 0,
    freshnessBoost: 0.18,
    totalScore: 4,
  },
  observedAtRange: {
    startedAt: new Date("2026-07-09T12:00:00.000Z"),
    endedAt: new Date("2026-07-09T12:01:00.000Z"),
  },
  whyImportant: ["Cross-provider signal"],
});
