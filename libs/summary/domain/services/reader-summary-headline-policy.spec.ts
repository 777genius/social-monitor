import type { TopRead } from "../entities/top-read";
import {
  groundedReaderHeadline,
  groundedTopReadTitle,
  isUnverifiedLegalTopRead,
} from "./reader-summary-headline-policy";

describe("reader summary top read headline policy", () => {
  it("source-frames and preserves an unverified legal source title", () => {
    expect(
      groundedTopReadTitle({
        title:
          "Apple sues OpenAI alleging trade secret theft, says scheme was 'at every level'",
        reason:
          "Reports describe alleged trade-secret theft, but the evidence does not include a primary court filing.",
        whyImportant: [
          "The alleged legal dispute could affect AI partner trust, but the merits remain unknown.",
        ],
        confidence: {
          level: "medium",
          score: 0.68,
          rationale:
            "Several monitored source groups repeat the report without first-party confirmation.",
        },
      }),
    ).toBe("Source report: Apple sues OpenAI alleging trade secret theft, says scheme was 'at every level'");
  });

  it("keeps a non-legal reader title unchanged", () => {
    expect(
      groundedTopReadTitle({
        title: "Developers compare Claude Code and OpenCode token use",
        reason: "The comparison includes concrete request logs.",
        whyImportant: ["Harness overhead can affect agent operating costs."],
        confidence: {
          level: "low",
          score: 0.42,
          rationale: "One cited source supports this story.",
        },
      }),
    ).toBe("Developers compare Claude Code and OpenCode token use");
  });

  it.each([
    ["Did Apple sue OpenAI?", "Source report: Did Apple sue OpenAI?"],
    [
      "Should Apple sue OpenAI over alleged model theft",
      "Source report: Should Apple sue OpenAI over alleged model theft",
    ],
    [
      "Why Apple sued OpenAI over model training",
      "Source report: Why Apple sued OpenAI over model training",
    ],
  ])(
    "does not turn a legal question or explainer into a fact",
    (title, expected) => {
      expect(
        groundedTopReadTitle({
          title,
          reason: "The report could not be independently verified.",
          whyImportant: [],
          confidence: {
            level: "low",
            score: 0.42,
            rationale: "This story has not been independently confirmed.",
          },
        }),
      ).toBe(expected);
    },
  );

  it("uses caution stated only in a legal title", () => {
    expect(
      groundedTopReadTitle({
        title: "Apple sues OpenAI, but no primary court filing is available",
        reason: "The dispute could affect AI platform trust.",
        whyImportant: [],
        confidence: {
          level: "medium",
          score: 0.62,
          rationale: "Two monitored source groups discuss this story.",
        },
      }),
    ).toBe(
      "Source report: Apple sues OpenAI, but no primary court filing is available",
    );
  });

  it("recognizes a missing court filing as the only caution signal", () => {
    expect(
      groundedTopReadTitle({
        title: "Apple sues OpenAI over trade secret theft",
        reason: "The evidence does not include a primary court filing.",
        whyImportant: ["The dispute could affect AI platform trust."],
        confidence: {
          level: "medium",
          score: 0.62,
          rationale: "Two monitored source groups discuss this story.",
        },
      }),
    ).toBe("Source report: Apple sues OpenAI over trade secret theft");
  });

  it("keeps a first-party legal filing concrete", () => {
    expect(
      groundedTopReadTitle({
        title: "Acme sues Example Labs over alleged model theft",
        reason: "Acme's first-party filing announces the lawsuit.",
        whyImportant: [],
        confidence: {
          level: "high",
          score: 0.9,
          rationale:
            "Two monitored source groups support this story, including an eligible first-party source.",
        },
      }),
    ).toBe("Acme sues Example Labs over alleged model theft");
  });

  it("exposes unverified legal lead eligibility to ranking audits", () => {
    expect(
      isUnverifiedLegalTopRead({
        title: "Reports say Apple sued OpenAI over alleged trade secret theft",
        reason: "The evidence does not include a primary court filing.",
        confidence: {
          rationale: "Two source groups repeat the report.",
        },
      }),
    ).toBe(true);
    expect(
      isUnverifiedLegalTopRead({
        title: "Acme sues Example Labs over alleged model theft",
        reason: "Acme's first-party filing announces the lawsuit.",
        confidence: {
          rationale: "Supported by an eligible first-party source.",
        },
      }),
    ).toBe(false);
  });
});

describe("reader summary grounded headline policy", () => {
  const topRead = (title: string): TopRead =>
    ({
      title,
      providerKey: "test-provider",
      providerName: "Test Provider",
      primaryActionKind: "read_source",
      reason: "Grounded reason.",
      matchedInterestIds: [],
      matchedRules: [],
      confirmedProviderKeys: ["test-provider", "other-provider"],
      providerMetrics: [],
      whyImportant: ["Context."],
      whyNow: "Now.",
      citationIds: ["c1"],
      confidence: {
        level: "high",
        score: 0.9,
        rationale: "Two monitored source groups support this story.",
      },
    }) as unknown as TopRead;

  it("rebuilds an off-lead top-read copy around the narrative lead", () => {
    expect(
      groundedReaderHeadline({
        headline:
          "Reports discuss Varonis' $6.3 billion sale shows (risks of growing old in cybersecurity)",
        sourceMix: [],
        topReads: [
          topRead(
            "Varonis' $6.3 billion sale shows (risks of growing old in cybersecurity)",
          ),
        ],
        narrativeLeadTitle: "WorkBuddy's multi-model workflow",
      }),
    ).toBe("Reports discuss WorkBuddy's multi-model workflow");
  });

  it("matches the top-read title only at whole-token boundaries", () => {
    expect(
      groundedReaderHeadline({
        headline: "Daily quantum chip progress leads discussion",
        sourceMix: [],
        topReads: [topRead("AI")],
        narrativeLeadTitle: "Quantum chips reach milestone",
      }),
    ).toBe("Daily quantum chip progress leads discussion");
  });

  it("still rebuilds when the top-read title matches as whole tokens", () => {
    expect(
      groundedReaderHeadline({
        headline: "Reports discuss quantum chips milestone news",
        sourceMix: [],
        topReads: [topRead("quantum chips")],
        narrativeLeadTitle: "Robot fleets learn shared maps",
      }),
    ).toBe("Reports discuss Robot fleets learn shared maps");
  });
});
