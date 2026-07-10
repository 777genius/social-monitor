import type { TopRead } from "../entities/top-read";
import {
  buildGroundedOneLineTakeaway,
  readerItemConfidence,
} from "./reader-summary-support";
import type { StoryCluster } from "../value-objects/summary-evidence-item";

describe("readerItemConfidence", () => {
  it("keeps single-source evidence low and capped", () => {
    expect(
      readerItemConfidence({
        cluster: undefined,
        evidenceCount: 1,
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
        evidenceCount: 2,
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
        evidenceCount: 1,
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
        evidenceCount: 2,
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
        evidenceCount: 2,
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
