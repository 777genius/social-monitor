import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { hasStrictPairwiseReaderSummaryStoryIdentity } from "./reader-summary-story-identity-policy";

describe("hasStrictPairwiseReaderSummaryStoryIdentity", () => {
  it("accepts one eligible pair with a facet, named product, event, and strong topic overlap", () => {
    expect(
      hasStrictPairwiseReaderSummaryStoryIdentity({
        leftEvidence: [
          evidence(
            "left",
            "OpenAI releases Codex terminal sandbox controls security update",
          ),
        ],
        rightEvidence: [
          evidence(
            "right",
            "Codex release adds terminal sandbox controls security update",
          ),
        ],
      }),
    ).toBe(true);
  });

  it("requires both items in the matching pair to be eligible", () => {
    expect(
      hasStrictPairwiseReaderSummaryStoryIdentity({
        leftEvidence: [
          evidence(
            "left",
            "OpenAI releases Codex terminal sandbox controls security update",
          ),
        ],
        rightEvidence: [
          evidence(
            "right",
            "Codex release adds terminal sandbox controls security update",
            { decision: "downrank" },
          ),
        ],
      }),
    ).toBe(false);
  });

  it("does not infer identity from an exact quality reason", () => {
    const reason = "Editors supplied the same explanation for both candidates.";

    expect(
      hasStrictPairwiseReaderSummaryStoryIdentity({
        leftEvidence: [
          evidence("left", "Cursor releases a terminal security update", {
            reason,
          }),
        ],
        rightEvidence: [
          evidence("right", "Codex benchmark measures database latency", {
            reason,
          }),
        ],
      }),
    ).toBe(false);
  });

  it("does not union identity facts across different evidence items", () => {
    expect(
      hasStrictPairwiseReaderSummaryStoryIdentity({
        leftEvidence: [
          evidence("left-product", "Codex security warning for terminal use"),
          evidence(
            "left-vocabulary",
            "Teams document latency memory caching deployment workflows",
          ),
        ],
        rightEvidence: [
          evidence("right-product", "Codex security report on browser exploits"),
          evidence(
            "right-vocabulary",
            "Teams document latency memory caching deployment workflows",
          ),
        ],
      }),
    ).toBe(false);
  });

  it.each([
    [
      "coding-agent",
      "Atlas coding agent releases terminal sandbox workflow controls",
      "Beacon coding agent releases terminal sandbox workflow controls",
    ],
    [
      "MCP",
      "Atlas MCP server releases terminal sandbox workflow controls",
      "Beacon MCP server releases terminal sandbox workflow controls",
    ],
  ])(
    "does not treat shared broad %s vocabulary as a named product identity",
    (_label, leftTitle, rightTitle) => {
      expect(
        hasStrictPairwiseReaderSummaryStoryIdentity({
          leftEvidence: [evidence("left", leftTitle)],
          rightEvidence: [evidence("right", rightTitle)],
        }),
      ).toBe(false);
    },
  );

  it("requires event agreement when either item contains event terms", () => {
    expect(
      hasStrictPairwiseReaderSummaryStoryIdentity({
        leftEvidence: [
          evidence(
            "left",
            "OpenAI releases Codex terminal sandbox controls security update",
          ),
        ],
        rightEvidence: [
          evidence(
            "right",
            "Codex terminal sandbox controls security update improves isolation",
          ),
        ],
      }),
    ).toBe(false);
  });
});

const evidence = (
  id: string,
  title: string,
  qualityOverrides: {
    readonly decision?: string;
    readonly reason?: string;
  } = {},
): SummaryEvidenceItem => ({
  feedItemId: `feed-${id}`,
  sourceItemId: `source-${id}`,
  sourceBindingId: `binding-${id}`,
  interestId: "ai-developer-tools",
  providerKey: id.startsWith("left") ? "rss" : "hacker-news",
  canonicalUrl: `https://example.test/${id}`,
  title,
  publishedAt: new Date("2026-07-15T12:00:00.000Z"),
  observedAt: new Date("2026-07-15T12:05:00.000Z"),
  score: 2.4,
  whyImportant: ["The evidence affects current developer workflows."],
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: qualityOverrides.decision ?? "eligible",
    flags: [],
    reason: qualityOverrides.reason ?? "Focused identity policy fixture.",
  },
});
